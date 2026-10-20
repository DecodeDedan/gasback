import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { erc20Abi, decodeEventLog } from 'viem';
import { ConnectKitButton } from 'connectkit';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle, ExternalLink, AlertTriangle, Receipt } from 'lucide-react';
import { NETWORK } from '@/gasback-config';
import { usePreparedWrite } from '@/hooks/usePreparedWrite';
import { GASBACK_ABI } from '@/gasback-abi';
import { useMerchantData, useUsdcBalance, useUsdcAllowance, useQuoteRebate } from '@/hooks/useMerchant';
import { NetworkGuard } from '@/components/NetworkGuard';
import { Meter } from '@/components/Meter';
import { useLiveGasPrice } from '@/hooks/useGasPrice';
import {
  formatUsdc, formatUsdcGas, parseUsdcInput, shortAddr,
  buildTxUrl, buildAddrUrl, gasCostToUsdc, decodeGasbackError,
} from '@/utils/format';

// Estimate for quote display
/** Gas a real pay() used on Arc (measured on the testnet fork), plus headroom for the approve-free path. */
const EST_PAY_GAS = 62_038n;

interface ReceiptData {
  payAmount: bigint;
  gasBurned: bigint;    // actual gasUsed * effectiveGasPrice in USDC 6-dec
  rebate: bigint;       // from Paid event
  net: bigint;          // payAmount - rebate
  txHash: string;
  gasUsedActual: bigint;
  gasPriceActual: bigint;
}

function SplitBar({ data }: { data: ReceiptData }) {
  const reduced = useReducedMotion();
  const total = Number(data.payAmount) + Number(data.gasBurned);
  const payPct = total > 0 ? (Number(data.payAmount) / total) * 100 : 80;
  const gasPct = total > 0 ? (Number(data.gasBurned) / total) * 100 : 10;
  const rebatePct = total > 0 ? (Number(data.rebate) / total) * 100 : 10;

  return (
    <div className="space-y-4">
      {/* Bar */}
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
        <div className="bg-ink" style={{ width: `${payPct}%` }} />
        <div className="bg-gas" style={{ width: `${gasPct}%` }} />
        <motion.div
          className="bg-refund"
          initial={reduced ? undefined : { width: 0 }}
          animate={{ width: `${rebatePct}%` }}
          transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1.0] }}
        />
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-ink" />
            <span className="text-muted text-sm">Paid</span>
          </div>
          <div className="font-mono tabular-nums text-ink">{formatUsdc(data.payAmount, 6)}</div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-gas" />
            <span className="text-muted text-sm">Gas burned</span>
          </div>
          <div className="font-mono tabular-nums text-gas">{formatUsdcGas(data.gasBurned)}</div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-refund" />
            <span className="text-muted text-sm">Gas refunded</span>
          </div>
          <div className="font-mono tabular-nums text-refund">{formatUsdcGas(data.rebate)}</div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-ink/30 border border-ink" />
            <span className="text-muted text-sm">Net cost</span>
          </div>
          <div className="font-mono tabular-nums text-ink">{formatUsdc(data.net, 6)}</div>
        </div>
      </div>
    </div>
  );
}

export function CheckoutPage() {
  const reduced = useReducedMotion();
  const { merchant } = useParams<{ merchant: string }>();
  const [searchParams] = useSearchParams();
  const amountStr = searchParams.get('amount') ?? '0.10';
  const orderRef = searchParams.get('ref') ?? 'order';

  const merchantAddr = merchant as `0x${string}` | undefined;
  const payAmount = parseUsdcInput(amountStr);
  const orderRefBytes32 = ('0x' + Buffer.from(orderRef.slice(0, 32).padEnd(32, '\0')).toString('hex')) as `0x${string}`;

  const { address, isConnected } = useAccount();

  const { pool, exists, isLoading: merchantLoading } = useMerchantData(merchantAddr);
  const { data: usdcBalance } = useUsdcBalance(address);
  const { data: allowance, refetch: refetchAllowance } = useUsdcAllowance(address);
  const liveGasPrice = useLiveGasPrice();
  const { data: quotedRebate } = useQuoteRebate(merchantAddr, EST_PAY_GAS, liveGasPrice ?? 0n);
  const estGasCost = liveGasPrice != null ? gasCostToUsdc(EST_PAY_GAS, liveGasPrice) : null;
  const rebate = (quotedRebate as bigint | undefined) ?? 0n;
  const netCost = payAmount + (estGasCost ?? 0n) - rebate;

  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [phase, setPhase] = useState<'idle' | 'approve' | 'pay'>('idle');

  const { send, data: txHash, isPending, error: writeError, reset } = usePreparedWrite();
  const { isLoading: isConfirming, isSuccess, data: txReceipt } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (writeError) {
      const msg = decodeGasbackError(writeError);
      setStatusMsg(msg || '');
      setPhase('idle');
    }
  }, [writeError]);

  useEffect(() => {
    if (isSuccess && txReceipt && phase === 'pay') {
      // Decode the Paid event
      let rebate = 0n;
      let gasPriceEvent = 0n;
      for (const log of txReceipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: GASBACK_ABI,
            eventName: 'Paid',
            topics: log.topics,
            data: log.data,
          });
          rebate = decoded.args.rebate;
          gasPriceEvent = decoded.args.gasPrice;
        } catch {}
      }
      const gasBurned = gasCostToUsdc(txReceipt.gasUsed, txReceipt.effectiveGasPrice ?? gasPriceEvent);
      setReceipt({
        payAmount,
        gasBurned,
        rebate,
        net: payAmount > rebate ? payAmount - rebate : 0n,
        txHash: txReceipt.transactionHash,
        gasUsedActual: txReceipt.gasUsed,
        gasPriceActual: txReceipt.effectiveGasPrice ?? gasPriceEvent,
      });
      setPhase('idle');
      setStatusMsg('');
      void refetchAllowance();
    }
    if (isSuccess && phase === 'approve') {
      void refetchAllowance();
      setPhase('idle');
      setStatusMsg('');
    }
  }, [isSuccess, txReceipt, phase, payAmount, refetchAllowance]);

  const needsApprove = (allowance ?? 0n) < payAmount;
  const poolEmpty = pool === 0n;
  const merchantMissing = !merchantLoading && !exists;

  function handleApprove() {
    reset();
    setPhase('approve');
    setStatusMsg('Confirm USDC approval in wallet…');
    void send({
      address: NETWORK.usdcAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [NETWORK.gasbackAddress, payAmount * 2n], // headroom
    });
  }

  function handlePay() {
    reset();
    setPhase('pay');
    setStatusMsg('Confirm payment in wallet…');
    void send({
      address: NETWORK.gasbackAddress,
      abi: GASBACK_ABI,
      functionName: 'pay',
      args: [merchantAddr!, payAmount, orderRefBytes32],
    });
  }

  if (receipt) {
    return (
      <div className="max-w-md mx-auto px-4 pt-16 pb-24">
        <motion.div
          initial={reduced ? undefined : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel p-5 sm:p-7 space-y-6"
        >
          <div className="flex items-center gap-3">
            <CheckCircle size={20} className="text-refund" />
            <span className="text-refund font-semibold">Payment confirmed</span>
          </div>

          <SplitBar data={receipt} />

          {/* Details */}
          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between text-muted">
              <span>Gas used</span>
              <span className="tabular-nums">{receipt.gasUsedActual.toLocaleString()} units</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Gas price</span>
              <span className="tabular-nums">{formatUsdcGas(receipt.gasPriceActual / 1_000_000_000_000n)} / gas</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Order ref</span>
              <span className="tabular-nums text-ink">{orderRef}</span>
            </div>
          </div>

          <a
            href={buildTxUrl(receipt.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-muted hover:text-gas transition-colors"
          >
            <ExternalLink size={12} />
            View on explorer
          </a>
        </motion.div>
      </div>
    );
  }

  return (
    <NetworkGuard>
      <div className="max-w-md mx-auto px-4 pt-12 pb-24">
        <div className="panel p-5 sm:p-7 space-y-6">
          <h1 className="m-0 text-ink text-3xl">Checkout</h1>

          {/* Merchant */}
          <div className="space-y-1">
            <div className="text-sm text-muted">Paying</div>
            <a
              href={buildAddrUrl(merchant ?? '')}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 font-mono text-sm text-ink hover:text-gas transition-colors"
            >
              {shortAddr(merchant ?? '')}
              <ExternalLink size={11} />
            </a>
            {merchantMissing && (
              <div className="text-xs text-danger">This merchant is not registered on Gasback.</div>
            )}
          </div>

          {/* The pump: sale, gas, refund and what the buyer actually spends */}
          <div className="pump p-4 sm:p-5 grid gap-3">
            <Meter label="Sale" value={formatUsdc(payAmount, 6)} size="lg" />
            <div className="h-px bg-line/60" aria-hidden="true" />
            <Meter label="Gas, est." value={estGasCost != null ? formatUsdcGas(estGasCost) : '…'} tone="gas" size="sm" />
            <Meter label="Refunded by merchant" value={formatUsdcGas(poolEmpty ? 0n : rebate)} tone="refund" size="sm" sign="−" />
            <div className="h-px bg-line/60" aria-hidden="true" />
            <Meter label="You spend" value={formatUsdc(netCost > 0n ? netCost : 0n, 6)} tone={poolEmpty ? 'ink' : 'gas'} size="md" />
            <p className="m-0 text-xs text-muted">Order {orderRef}</p>
          </div>

          {poolEmpty && (
            <p className="m-0 flex items-start gap-2 text-xs text-warning" role="note">
              <AlertTriangle size={14} className="shrink-0 mt-px" aria-hidden="true" />
              This merchant isn't covering gas right now, so you pay about {estGasCost != null ? formatUsdcGas(estGasCost) : 'a fraction of a cent'} on top.
            </p>
          )}

          {/* Status */}
          {statusMsg && (
            <div className="text-xs font-mono text-muted">{statusMsg}</div>
          )}
          {isConfirming && (
            <div className="text-xs font-mono text-gas">Confirming on chain…</div>
          )}

          {/* Balance warning */}
          {isConnected && usdcBalance != null && (usdcBalance) < payAmount && (
            <div className="text-xs text-danger font-mono">
              Insufficient USDC. You have {formatUsdc(usdcBalance, 2)}.
            </div>
          )}

          {/* CTA */}
          {!isConnected ? (
            <ConnectKitButton />
          ) : needsApprove ? (
            <button
              onClick={handleApprove}
              disabled={isPending || isConfirming || merchantMissing}
              className="btn-gas w-full"
            >
              {isPending ? 'Confirm in wallet…' : isConfirming ? 'Approving…' : 'Allow USDC'}
            </button>
          ) : (
            <button
              onClick={handlePay}
              disabled={isPending || isConfirming || merchantMissing || !address || (usdcBalance != null && (usdcBalance) < payAmount)}
              className="btn-gas w-full"
            >
              {isPending
                ? 'Confirm in wallet…'
                : isConfirming
                ? 'Paying…'
                : poolEmpty
                ? `Pay ${formatUsdc(payAmount, 2)}`
                : `Pay ${formatUsdc(payAmount, 2)}, gas included`}
            </button>
          )}
        </div>
      </div>
    </NetworkGuard>
  );
}
