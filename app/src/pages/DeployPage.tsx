/**
 * /deploy — Deploy Gasback to Arc mainnet from the connected browser wallet.
 * Not linked from the nav. Arc Studio doesn't sign mainnet; the user does.
 */
import { useState } from 'react';
import { useAccount, useDeployContract, usePublicClient, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { encodeDeployData } from 'viem';
import { ConnectKitButton } from 'connectkit';
import { Copy, Check, ExternalLink, AlertTriangle, Rocket } from 'lucide-react';
import { GASBACK_ABI } from '@/gasback-abi';
import { mainnet } from '@/gasback-config';
import { shortAddr } from '@/utils/format';
import artifact from '../../contracts/out/Gasback.sol/Gasback.json';

const MAINNET_USDC = '0x3600000000000000000000000000000000000000' as const;
const MAINNET_CHAIN_ID = 5042 as const;
/** 1 gwei tip on top of Arc's base fee; wallets otherwise pick tips several times the fee. */
const TIP_WEI = 1_000_000_000n;

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted mb-1">{children}</div>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      onClick={handleCopy}
      className="ml-2 p-1 rounded text-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gas"
      aria-label="Copy"
    >
      {copied ? <Check size={13} className="text-refund" /> : <Copy size={13} />}
    </button>
  );
}

export function DeployPage() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const mainnetClient = usePublicClient({ chainId: MAINNET_CHAIN_ID });
  const [prepareError, setPrepareError] = useState('');
  const { deployContract, data: txHash, isPending, error: writeError } = useDeployContract();
  const { isLoading: isConfirming, isSuccess, data: txReceipt } = useWaitForTransactionReceipt({ hash: txHash });

  const [overheadGas, setOverheadGas] = useState(String(mainnet.overheadGas));
  const deployedAddress = isSuccess ? (txReceipt?.contractAddress ?? '') : '';

  const wrongChain = isConnected && chainId !== MAINNET_CHAIN_ID;

  const bytecode = artifact.bytecode.object as `0x${string}`;

  function handleDeploy() {
    if (!isConnected) return;
    if (wrongChain) {
      switchChain({ chainId: MAINNET_CHAIN_ID });
      return;
    }
    if (!/^\d+$/.test(overheadGas)) {
      setPrepareError('overheadGas must be a whole number of gas units, for example 42000.');
      return;
    }
    void deployWithExplicitFees(BigInt(overheadGas));
  }

  /** Estimates gas and prices the deploy at base fee + 1 gwei, so the wallet neither guesses nor overpays. */
  async function deployWithExplicitFees(overhead: bigint) {
    if (!mainnetClient || !address) return;
    setPrepareError('');
    try {
      const data = encodeDeployData({ abi: GASBACK_ABI, bytecode, args: [MAINNET_USDC, overhead] });
      const [gas, block] = await Promise.all([mainnetClient.estimateGas({ account: address, data }), mainnetClient.getBlock()]);
      const baseFee = block.baseFeePerGas ?? (await mainnetClient.getGasPrice());
      deployContract({
        abi: GASBACK_ABI,
        bytecode,
        args: [MAINNET_USDC, overhead],
        chainId: MAINNET_CHAIN_ID,
        gas: (gas * 120n) / 100n,
        maxPriorityFeePerGas: TIP_WEI,
        maxFeePerGas: baseFee * 2n + TIP_WEI,
      });
    } catch (err: unknown) {
      setPrepareError(err instanceof Error ? err.message.split('\n')[0] : 'Could not prepare the deploy. Check your USDC balance on Arc mainnet.');
    }
  }

  const errorMsg = prepareError ? prepareError : writeError
    ? (writeError.message?.includes('user rejected') ? '' : writeError.message?.slice(0, 200) ?? 'Deploy failed.')
    : '';

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Rocket size={18} className="text-gas" />
        <h1 className="text-ink text-xl font-bold">Deploy to Arc Mainnet</h1>
      </div>

      {/* Warning */}
      <div className="flex gap-3 p-4 rounded-xl border border-gas/30 bg-gas/5">
        <AlertTriangle size={16} className="text-gas mt-0.5 shrink-0" />
        <p className="text-sm text-ink">
          This deploys Gasback to Arc mainnet using <strong>real funds</strong> from your connected wallet.
          Transactions are irreversible. Review the constructor args before proceeding.
        </p>
      </div>

      {!isConnected && (
        <div className="flex flex-col items-center gap-4 py-8">
          <p className="text-muted text-sm">Connect your wallet to deploy.</p>
          <ConnectKitButton />
        </div>
      )}

      {isConnected && (
        <div className="space-y-6">
          {/* Wallet + chain */}
          <div className="panel p-5 sm:p-6 space-y-3">
            <div className="flex items-center justify-between">
              <Label>Connected wallet</Label>
              <ConnectKitButton />
            </div>
            <div className="font-mono text-sm text-ink tabular-nums flex items-center gap-1">
              {shortAddr(address!)}
              <CopyButton text={address!} />
            </div>
            {wrongChain && (
              <button
                onClick={() => switchChain({ chainId: MAINNET_CHAIN_ID })}
                disabled={isSwitching}
                className="btn-line w-full"
              >
                {isSwitching ? 'Switching…' : 'Switch to Arc mainnet'}
              </button>
            )}
            {!wrongChain && (
              <div className="flex items-center gap-1.5 text-xs text-refund font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-refund" />
                On Arc mainnet (chain {MAINNET_CHAIN_ID})
              </div>
            )}
          </div>

          {/* Constructor args */}
          <div className="panel p-5 sm:p-6 space-y-4">
            <div className="text-lg font-display font-semibold text-ink">Constructor Args</div>

            <div>
              <Label>USDC address (Arc mainnet)</Label>
              <div className="flex items-center font-mono text-sm text-ink tabular-nums">
                {MAINNET_USDC}
                <CopyButton text={MAINNET_USDC} />
              </div>
            </div>

            <div>
              <Label>overheadGas — calibrated value (editable)</Label>
              <input
                type="number"
                min="0"
                value={overheadGas}
                onChange={(e) => setOverheadGas(e.target.value)}
                className="field"
              />
              <p className="text-[10px] font-mono text-muted mt-1">
                Measured on a real Arc Testnet payment: {mainnet.overheadGas} gas makes the refund match the fee.
              </p>
            </div>
          </div>

          {/* Bytecode preview */}
          <div className="panel p-5 sm:p-6 space-y-2">
            <div className="flex items-center justify-between">
              <Label>Compiled bytecode ({(bytecode.length / 2 - 1).toLocaleString()} bytes)</Label>
              <CopyButton text={bytecode} />
            </div>
            <div className="font-mono text-[10px] text-muted break-all leading-relaxed max-h-20 overflow-hidden relative">
              {bytecode.slice(0, 120)}…
              <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface" />
            </div>
          </div>

          {/* Deploy button */}
          {!isSuccess && (
            <button
              onClick={handleDeploy}
              disabled={isPending || isConfirming || wrongChain}
              className="btn-gas w-full"
            >
              {isPending
                ? 'Confirm in wallet…'
                : isConfirming
                ? 'Confirming on Arc mainnet…'
                : wrongChain
                ? 'Switch to Arc mainnet first'
                : 'Deploy to Arc mainnet'}
            </button>
          )}

          {errorMsg && (
            <div className="text-sm text-danger font-mono p-3 rounded-lg bg-danger/5 border border-danger/20">
              {errorMsg}
            </div>
          )}

          {/* Success receipt */}
          {isSuccess && deployedAddress && (
            <div className="panel p-5 sm:p-6 space-y-4">
              <div className="text-sm font-bold text-refund">Deployed successfully</div>

              <div>
                <Label>Contract address</Label>
                <div className="flex items-center gap-1 font-mono text-sm text-ink tabular-nums break-all">
                  {deployedAddress}
                  <CopyButton text={deployedAddress} />
                  <a
                    href={`${mainnet.explorerBase}/address/${deployedAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-muted hover:text-ink"
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>

              {txHash && (
                <div>
                  <Label>Transaction</Label>
                  <div className="flex items-center gap-1 font-mono text-xs text-muted">
                    {txHash.slice(0, 18)}…{txHash.slice(-8)}
                    <CopyButton text={txHash} />
                    <a
                      href={`${mainnet.explorerBase}/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted hover:text-ink"
                    >
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
              )}

              <div className="p-3 rounded-lg border border-line bg-page">
                <div className="text-[10px] font-mono text-muted mb-1">Next step — add to .env</div>
                <div className="font-mono text-xs text-gas select-all break-all">
                  VITE_GASBACK_MAINNET={deployedAddress}
                  <br />
                  VITE_GASBACK_MAINNET_BLOCK={txReceipt?.blockNumber.toString()}
                  <br />
                  VITE_NETWORK=mainnet
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
