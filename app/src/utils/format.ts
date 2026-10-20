import { formatUnits, parseUnits } from 'viem';
import { NETWORK } from '@/gasback-config';

/** Format a raw USDC amount (6 dec) as a dollar string with custom decimal places. */
export function formatUsdc(raw: bigint, decimals = 2): string {
  const n = Number(raw) / 10 ** NETWORK.usdcDecimals;
  return `$${n.toFixed(decimals)}`;
}

/** Format a raw USDC amount (6 dec) as a dollar string with 6 decimals for gas amounts. */
export function formatUsdcGas(raw: bigint): string {
  const n = Number(raw) / 10 ** NETWORK.usdcDecimals;
  return `$${n.toFixed(6)}`;
}

/** Parse a dollar string like "5.00" to raw USDC units (6 dec). */
export function parseUsdcInput(dollarStr: string): bigint {
  const n = parseFloat(dollarStr);
  if (isNaN(n) || n < 0) return 0n;
  return BigInt(Math.round(n * 10 ** NETWORK.usdcDecimals));
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatTxHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

export function buildTxUrl(hash: string): string {
  return `${NETWORK.explorerBase}/tx/${hash}`;
}

export function buildAddrUrl(addr: string): string {
  return `${NETWORK.explorerBase}/address/${addr}`;
}

/** Convert gas cost in native 18-dec wei to USDC 6-dec units. */
export function gasCostToUsdc(gasUsed: bigint, gasPrice: bigint): bigint {
  // native decimals = 18, usdc decimals = 6 → divide by 10^12
  return (gasUsed * gasPrice) / 10n ** 12n;
}

/** Decode a Gasback custom revert error name into human English. */
export function decodeGasbackError(err: unknown): string {
  const msg = (err as Error)?.message ?? String(err);
  if (msg.includes('AlreadyRegistered')) return 'You are already registered as a merchant.';
  if (msg.includes('NotMerchant')) return 'Only registered merchants can do this.';
  if (msg.includes('ZeroAmount')) return 'Amount must be greater than zero.';
  if (msg.includes('InsufficientPool')) return 'Withdrawal exceeds available pool balance.';
  if (msg.includes('UnregisteredMerchant')) return 'This merchant is not registered.';
  if (msg.includes('SelfPay')) return "You can't pay yourself.";
  if (msg.toLowerCase().includes('user rejected') || msg.includes('4001')) return 'You declined the request in your wallet. Nothing was sent.';
  if (msg.toLowerCase().includes('insufficient')) return 'Insufficient USDC balance or allowance.';
  if (msg.toLowerCase().includes('allowance') || msg.toLowerCase().includes('transfer amount exceeds'))
    return 'Allowance too low — approve USDC first.';
  if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('timeout'))
    return 'Network error. Please retry.';
  return 'Transaction failed. Please try again.';
}

/** Parses a gwei amount typed by a person ("70", "23.5") into wei; null when it is not a number. */
export function parseGweiInput(gweiStr: string): bigint | null {
  const trimmed = gweiStr.trim();
  if (!/^\d+(\.\d{1,9})?$/.test(trimmed)) return null;
  return parseUnits(trimmed, 9);
}

export function formatGwei(wei: bigint): string {
  return formatUnits(wei, 9).replace(/(\.\d{2})\d+$/, '$1');
}

/** Explains a failed network switch, including the details to add Arc to a wallet that does not know it yet. */
export function switchErrorMessage(err: unknown): string {
  const msg = ((err as Error)?.message ?? String(err)).toLowerCase();
  if (msg.includes('user rejected') || msg.includes('4001')) return 'You declined the network switch. Gasback needs your wallet on the Arc network.';
  return `Your wallet could not switch networks. Add it manually: ${NETWORK.chainName}, chain ID ${NETWORK.chainId}, RPC ${NETWORK.rpcUrl}, currency USDC.`;
}
