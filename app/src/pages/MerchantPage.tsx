import { useState, useEffect } from 'react';
import { useAccount, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { erc20Abi } from 'viem';
import { ConnectKitButton } from 'connectkit';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, ExternalLink, Store } from 'lucide-react';
import { NETWORK } from '@/gasback-config';
import { usePreparedWrite } from '@/hooks/usePreparedWrite';
import { useLiveGasPrice } from '@/hooks/useGasPrice';
import { GASBACK_ABI } from '@/gasback-abi';
import { useMerchantData, useUsdcBalance, useUsdcAllowance } from '@/hooks/useMerchant';
import { usePaidEvents } from '@/hooks/usePaidEvents';
import { NetworkGuard } from '@/components/NetworkGuard';
import {
  formatUsdc, formatUsdcGas, parseUsdcInput, shortAddr,
  buildTxUrl, decodeGasbackError, parseGweiInput, formatGwei, switchErrorMessage,
} from '@/utils/format';

// Fallback if live gas price hasn't loaded yet (25 gwei × 3)
const MAX_GAS_PRICE_FALLBACK = 75_000_000_000n;


function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted mb-1">{children}</div>;
}

function StatCard({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <Label>{label}</Label>
      <div className={`font-mono text-xl tabular-nums ${green ? 'text-refund' : 'text-ink'}`}>
        {value}
      </div>
    </div>
  );
}

export function MerchantPage() {
  const reduced = useReducedMotion();
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, error: switchError } = useSwitchChain();

  const liveGasPrice = useLiveGasPrice();
  const suggestedMaxGasPrice = liveGasPrice ? liveGasPrice * 3n : MAX_GAS_PRICE_FALLBACK;

  const { pool, maxRebatePerTx, maxGasPrice, exists, isLoading: merchantLoading, error: merchantError, refetch } = useMerchantData(address);
  const { data: usdcBalance } = useUsdcBalance(address);
  const { data: allowance, refetch: refetchAllowance } = useUsdcAllowance(address);
  const { events, totalGasRefunded } = usePaidEvents({ merchantFilter: address, limit: 20 });

  // Register form — prefill gas price from live network price × 3 once it loads
  const [regMaxRebate, setRegMaxRebate] = useState('0.05');
  const [regMaxGasPrice, setRegMaxGasPrice] = useState('');
  // Keep gas price field in sync with live price (only before user touches it)
  const [gasPriceTouched, setGasPriceTouched] = useState(false);

  useEffect(() => {
    if (!gasPriceTouched && liveGasPrice) {
      setRegMaxGasPrice(String(liveGasPrice * 3n));
    }
  }, [liveGasPrice, gasPriceTouched]);
  // Fund/withdraw
  const [fundAmount, setFundAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  // Limits editor
  const [editMaxRebate, setEditMaxRebate] = useState('');
  const [editMaxGasPrice, setEditMaxGasPrice] = useState('');
  // Pay-link builder
  const [payLinkAmount, setPayLinkAmount] = useState('5.00');
  const [payLinkRef, setPayLinkRef] = useState('');
  const [copied, setCopied] = useState(false);
  // Status
  const [statusMsg, setStatusMsg] = useState('');

  const { send, data: txHash, isPending, error: writeError, reset } = usePreparedWrite();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (exists) {
      setEditMaxRebate((Number(maxRebatePerTx) / 1e6).toFixed(2));
      setEditMaxGasPrice(formatGwei(maxGasPrice));
    }
  }, [exists, maxRebatePerTx, maxGasPrice]);

  useEffect(() => {
    if (isSuccess) {
      void refetch();
      void refetchAllowance();
      setStatusMsg('');
    }
  }, [isSuccess, refetch, refetchAllowance]);

  useEffect(() => {
    if (switchError) setStatusMsg(switchErrorMessage(switchError));
  }, [switchError]);

  useEffect(() => {
    if (writeError) {
      const msg = decodeGasbackError(writeError);
      if (msg) setStatusMsg(msg);
    }
  }, [writeError]);

  const wrongChain = isConnected && chainId !== NETWORK.chainId;

  // ---------- actions ----------

  function handleRegister() {
    if (wrongChain) { switchChain({ chainId: NETWORK.chainId }); return; }
    setStatusMsg('');
    reset();
    const maxRebate = parseUsdcInput(regMaxRebate);
    const maxGasPrice = regMaxGasPrice ? parseGweiInput(regMaxGasPrice) : suggestedMaxGasPrice;
    if (maxRebate == null || maxRebate <= 0n) {
      setStatusMsg('Enter a max rebate in dollars, for example 0.05.');
      return;
    }
    if (maxGasPrice == null || maxGasPrice <= 0n) {
      setStatusMsg('Enter a max gas price in gwei, for example 70.');
      return;
    }
    void send({
      address: NETWORK.gasbackAddress,
      abi: GASBACK_ABI,
      functionName: 'registerMerchant',
      args: [maxRebate, maxGasPrice],
    });
    setStatusMsg('Confirm in wallet…');
  }

  function handleApproveForFund() {
    if (wrongChain) { switchChain({ chainId: NETWORK.chainId }); return; }
    const raw = parseUsdcInput(fundAmount);
    if (!raw) return;
    reset();
    setStatusMsg('Confirm approval in wallet…');
    void send({
      address: NETWORK.usdcAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [NETWORK.gasbackAddress, raw],
    });
  }

  function handleFund() {
    if (wrongChain) { switchChain({ chainId: NETWORK.chainId }); return; }
    const raw = parseUsdcInput(fundAmount);
    if (!raw) return;
    reset();
    setStatusMsg('Confirm in wallet…');
    void send({
      address: NETWORK.gasbackAddress,
      abi: GASBACK_ABI,
      functionName: 'fundPool',
      args: [raw],
    });
  }

  function handleWithdraw() {
    if (wrongChain) { switchChain({ chainId: NETWORK.chainId }); return; }
    const raw = parseUsdcInput(withdrawAmount);
    if (!raw) return;
    reset();
    setStatusMsg('Confirm in wallet…');
    void send({
      address: NETWORK.gasbackAddress,
      abi: GASBACK_ABI,
      functionName: 'withdrawPool',
      args: [raw],
    });
  }

  function handleSetLimits() {
    if (wrongChain) { switchChain({ chainId: NETWORK.chainId }); return; }
    const nextRebate = parseUsdcInput(editMaxRebate);
    const nextGasPrice = editMaxGasPrice ? parseGweiInput(editMaxGasPrice) : maxGasPrice;
    if (nextRebate <= 0n) {
      setStatusMsg('Enter a max rebate in dollars, for example 0.05.');
      return;
    }
    if (nextGasPrice == null || nextGasPrice <= 0n) {
      setStatusMsg('Enter a max gas price in gwei, for example 70.');
      return;
    }
    reset();
    setStatusMsg('Confirm in wallet…');
    void send({
      address: NETWORK.gasbackAddress,
      abi: GASBACK_ABI,
      functionName: 'setLimits',
      args: [nextRebate, nextGasPrice],
    });
  }

  const fundNeedsApprove = (allowance ?? 0n) < parseUsdcInput(fundAmount);
  const payLink = address
    ? `${window.location.origin}/pay/${address}?amount=${payLinkAmount}&ref=${payLinkRef || 'order'}`
    : '';

  function handleCopy() {
    if (!payLink) return;
    void navigator.clipboard.writeText(payLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!isConnected) {
    return (
      <div className="max-w-md mx-auto px-4 pt-24 flex flex-col items-center gap-6">
        <Store size={32} className="text-gas" />
        <h1 className="text-ink text-2xl font-bold text-center">Merchant Dashboard</h1>
        <p className="text-muted text-center text-sm">Connect your wallet to register or manage your Gasback pool.</p>
        <ConnectKitButton />
      </div>
    );
  }

  return (
    <NetworkGuard>
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <div className="flex items-center gap-3">
          <Store size={20} className="text-gas" />
          <h1 className="text-ink text-xl font-bold">Merchant Dashboard</h1>
          <span className="ml-auto font-mono text-xs text-muted">{shortAddr(address!)}</span>
        </div>

        {/* Status banner */}
        <AnimatePresence>
          {(statusMsg || isConfirming || isSuccess) && (
            <motion.div
              initial={reduced ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`px-4 py-3 rounded-lg text-sm font-mono border ${
                isSuccess
                  ? 'border-refund/30 bg-refund/5 text-refund'
                  : isConfirming
                  ? 'border-gas/30 bg-gas/5 text-gas'
                  : 'border-line text-muted'
              }`}
            >
              {isSuccess
                ? 'Confirmed.'
                : isConfirming
                ? 'Confirming on chain…'
                : statusMsg}
              {isSuccess && txHash && (
                <a
                  href={buildTxUrl(txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 inline-flex items-center gap-1 underline text-refund"
                >
                  View tx <ExternalLink size={11} />
                </a>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {merchantLoading && (
          <div className="panel p-6 grid gap-3" aria-busy="true">
            <p className="m-0 text-muted text-sm">Reading your merchant account from Arc…</p>
            <div className="h-10 rounded-xl bg-raised motion-safe:animate-pulse" />
          </div>
        )}
        {merchantError && (
          <div className="panel p-6 grid gap-3" role="alert">
            <p className="m-0 text-ink">Couldn't read your merchant account from Arc.</p>
            <p className="m-0 text-muted text-sm">The network didn't answer. Your funds and settings are safe on-chain.</p>
            <button type="button" onClick={() => void refetch()} className="btn-line w-fit">Try again</button>
          </div>
        )}

        {/* Not registered */}
        {!merchantLoading && !merchantError && !exists ? (
          <div className="panel p-5 sm:p-7 space-y-5">
            <div className="flex items-center gap-2">
              <span className="text-ink text-2xl font-display font-semibold">Register as merchant</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Max rebate per tx ($)</Label>
                <input
                  type="number" min="0" step="0.01"
                  value={regMaxRebate}
                  onChange={(e) => setRegMaxRebate(e.target.value)}
                  className="field"
                  placeholder="1.00"
                />
              </div>
              <div>
                <Label>Max gas price (gwei), defaults to live price × 3</Label>
                <input
                  type="number" min="0" step="any" inputMode="decimal"
                  value={regMaxGasPrice}
                  onChange={(e) => { setGasPriceTouched(true); setRegMaxGasPrice(e.target.value); }}
                  onFocus={() => setGasPriceTouched(true)}
                  className="field"
                  placeholder={formatGwei(suggestedMaxGasPrice)}
                />
              </div>
            </div>
            <button
              onClick={handleRegister}
              disabled={isPending || isConfirming}
              className="btn-gas w-full sm:w-auto"
            >
              {isPending ? 'Confirm in wallet…' : isConfirming ? 'Registering…' : 'Register'}
            </button>
          </div>
        ) : null}

        {/* Registered stats */}
        {exists && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Pool balance" value={formatUsdc(pool)} />
              <StatCard label="Max rebate/tx" value={formatUsdc(maxRebatePerTx, 4)} />
              <StatCard label="Max gas price" value={`${formatGwei(maxGasPrice)} gwei`} />
              <StatCard label="Gas refunded" value={formatUsdcGas(totalGasRefunded)} green />
            </div>

            {/* Fund / Withdraw */}
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Fund */}
              <div className="panel p-5 sm:p-6 space-y-4">
                <Label>Fund pool</Label>
                <div className="space-y-1">
                  <div className="text-[10px] text-muted font-mono">
                    USDC balance: {usdcBalance != null ? formatUsdc(usdcBalance, 2) : '—'}
                  </div>
                  <input
                    type="number" min="0" step="0.01"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    className="field"
                    placeholder="0.50"
                  />
                </div>
                {fundNeedsApprove ? (
                  <button
                    onClick={handleApproveForFund}
                    disabled={isPending || isConfirming || !fundAmount}
                    className="btn-line w-full"
                  >
                    {isPending ? 'Confirm in wallet…' : 'Allow USDC'}
                  </button>
                ) : (
                  <button
                    onClick={handleFund}
                    disabled={isPending || isConfirming || !fundAmount}
                    className="btn-gas w-full"
                  >
                    {isPending ? 'Confirm in wallet…' : isConfirming ? 'Adding…' : 'Add to pool'}
                  </button>
                )}
              </div>

              {/* Withdraw */}
              <div className="panel p-5 sm:p-6 space-y-4">
                <Label>Withdraw pool</Label>
                <div className="space-y-1">
                  <div className="text-[10px] text-muted font-mono">
                    Available: {formatUsdc(pool, 6)}
                  </div>
                  <input
                    type="number" min="0" step="0.01"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="field"
                    placeholder="0.50"
                  />
                </div>
                <button
                  onClick={handleWithdraw}
                  disabled={isPending || isConfirming || !withdrawAmount || parseUsdcInput(withdrawAmount) > pool}
                  className="btn-line w-full"
                >
                  {isPending ? 'Confirm in wallet…' : isConfirming ? 'Withdrawing…' : 'Withdraw'}
                </button>
              </div>
            </div>

            {/* Limits editor */}
            <div className="panel p-5 sm:p-6 space-y-4">
              <Label>Update limits</Label>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Max rebate per tx ($)</Label>
                  <input
                    type="number" min="0" step="0.01"
                    value={editMaxRebate}
                    onChange={(e) => setEditMaxRebate(e.target.value)}
                    className="field"
                  />
                </div>
                <div>
                  <Label>Max gas price (gwei)</Label>
                  <input
                    type="number" min="0"
                    value={editMaxGasPrice}
                    onChange={(e) => setEditMaxGasPrice(e.target.value)}
                    className="field"
                  />
                </div>
              </div>
              <button
                onClick={handleSetLimits}
                disabled={isPending || isConfirming}
                className="px-5 py-2.5 rounded-lg border border-line text-ink text-sm font-semibold disabled:opacity-40 hover:border-gas/40 hover:text-gas transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gas"
              >
                {isPending ? 'Confirm in wallet…' : 'Save limits'}
              </button>
            </div>

            {/* Pay-link builder */}
            <div className="panel p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Label>Pay-link builder</Label>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Amount ($)</Label>
                  <input
                    type="number" min="0" step="0.01"
                    value={payLinkAmount}
                    onChange={(e) => setPayLinkAmount(e.target.value)}
                    className="field"
                  />
                </div>
                <div>
                  <Label>Order ref</Label>
                  <input
                    type="text"
                    value={payLinkRef}
                    onChange={(e) => setPayLinkRef(e.target.value)}
                    className="field"
                    placeholder="order-42"
                  />
                </div>
              </div>
              {payLink && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-3 py-2 rounded-lg bg-raised border border-line font-mono text-xs text-muted truncate">
                      {payLink}
                    </div>
                    <button
                      onClick={handleCopy}
                      className="p-2 rounded-lg border border-line text-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gas"
                      aria-label="Copy link"
                    >
                      {copied ? <Check size={14} className="text-refund" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <div className="flex justify-center">
                    <div className="p-3 rounded-xl bg-white">
                      <QRCodeSVG value={payLink} size={120} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Recent payments */}
            <div className="panel overflow-hidden">
              <div className="px-5 py-3 border-b border-line">
                <span className="text-sm text-muted">Recent payments</span>
              </div>
              {events.length === 0 ? (
                <div className="px-5 py-8 text-center text-muted text-sm">No payments yet.</div>
              ) : (
                <div className="divide-y divide-line">
                  {events.map((e) => (
                    <div key={e.txHash} className="px-5 py-3 flex items-center gap-3 text-xs">
                      <span className="font-mono text-muted tabular-nums">{shortAddr(e.customer)}</span>
                      <span className="flex-1 font-mono text-ink tabular-nums">{formatUsdc(e.amount, 2)}</span>
                      <span className="font-mono text-refund tabular-nums">+{formatUsdcGas(e.rebate)}</span>
                      {e.txHash && (
                        <a href={buildTxUrl(e.txHash)} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-gas">
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </NetworkGuard>
  );
}
