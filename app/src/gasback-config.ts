import { fallback, http, type Transport } from 'viem';

/**
 * Gasback network configuration.
 *
 * Active network is driven by VITE_NETWORK env var ("testnet" | "mainnet", default "testnet").
 * Mainnet gasbackAddress comes from VITE_GASBACK_MAINNET.
 * To switch to mainnet: set VITE_NETWORK=mainnet and VITE_GASBACK_MAINNET=0x... in .env.
 */

export interface GasbackNetworkConfig {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerBase: string;
  usdcAddress: `0x${string}`;
  gasbackAddress: `0x${string}`;
  usdcDecimals: number;
  /** Decimals of the native gas token (18 on Arc — gas is USDC native). */
  gasNativeDecimals: number;
  isTestnet: boolean;
  /** Block at which the Gasback contract was deployed. Used as getLogs fromBlock for full history. */
  deployBlock: bigint;
  /** Calibrated overheadGas used at deploy time (informational, used in /deploy route). */
  overheadGas: number;
}

export const testnet: GasbackNetworkConfig = {
  chainId: 5042002,
  chainName: 'Arc Testnet',
  rpcUrl: 'https://rpc.testnet.arc.io',
  explorerBase: 'https://explorer.testnet.arc.io',
  usdcAddress: '0x3600000000000000000000000000000000000000',
  gasbackAddress: '0xc0ad33f01758f9d0e15f4dc4c8ddfbc998477df0',
  usdcDecimals: 6,
  gasNativeDecimals: 18,
  isTestnet: true,
  deployBlock: 68145772n,
  overheadGas: 38100,
};

const _mainnetAddr = import.meta.env.VITE_GASBACK_MAINNET as string | undefined;
/** Block the mainnet contract was created in; history scans start here instead of at genesis. */
const _mainnetBlock = import.meta.env.VITE_GASBACK_MAINNET_BLOCK as string | undefined;

export const mainnet: GasbackNetworkConfig = {
  chainId: 5042,
  chainName: 'Arc',
  rpcUrl: 'https://rpc.mainnet.arc.io',
  explorerBase: 'https://explorer.arc.io',
  usdcAddress: '0x3600000000000000000000000000000000000000',
  // Will be the zero address until VITE_GASBACK_MAINNET is set — the DeployPage handles deploy.
  gasbackAddress: (_mainnetAddr && _mainnetAddr.startsWith('0x') ? _mainnetAddr : '0x0000000000000000000000000000000000000000') as `0x${string}`,
  usdcDecimals: 6,
  gasNativeDecimals: 18,
  isTestnet: false,
  deployBlock: _mainnetBlock && /^\d+$/.test(_mainnetBlock) ? BigInt(_mainnetBlock) : 0n,
  // Measured on a real Arc Testnet pay() (tx 0xb2b2d67d…): 38,100 left the refund 4.7% short; +3,897 gas closes it.
  overheadGas: 42000,
};

const _networkEnv = import.meta.env.VITE_NETWORK as string | undefined;
const _isMainnet = _networkEnv === 'mainnet';

/** Active network. Controlled by VITE_NETWORK env var. */
export const NETWORK: GasbackNetworkConfig = _isMainnet ? mainnet : testnet;

/** True when mainnet is selected but no address has been deployed yet. */
export const MAINNET_NOT_DEPLOYED =
  _isMainnet && mainnet.gasbackAddress === '0x0000000000000000000000000000000000000000';

/** Same-origin RPC paths, proxied to Arc by vercel.json (and vite.config.ts in dev). */
const RPC_PROXY_PATH: Record<number, string> = { 5042002: '/rpc/arc-testnet', 5042: '/rpc/arc-mainnet' };
const RPC_TIMEOUT_MS = 10_000;

/**
 * RPC transport for a chain: the same-origin proxy first, then the public endpoint.
 * Privacy blockers (Brave Shields) block cross-site calls to RPC hosts with ERR_BLOCKED_BY_CLIENT; a call to our own
 * domain is not cross-site, so reads keep working, and the direct endpoint still covers a proxy outage.
 */
export function rpcTransport(chainId: number = NETWORK.chainId, directUrl: string = NETWORK.rpcUrl): Transport {
  const proxyPath = RPC_PROXY_PATH[chainId];
  const direct = http(directUrl, { timeout: RPC_TIMEOUT_MS });
  if (!proxyPath || typeof window === 'undefined') return direct;
  return fallback([http(window.location.origin + proxyPath, { timeout: RPC_TIMEOUT_MS }), direct]);
}
