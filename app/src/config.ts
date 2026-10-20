/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig, createStorage } from 'wagmi'
import { mainnet, type Chain } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { rpcTransport } from './gasback-config'

// Arc mainnet — not yet in viem's built-in chains list, defined here
export const arc: Chain = {
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.arc.io'] },
    public: { http: ['https://rpc.mainnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' },
  },
}

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(arc.id, 'https://rpc.mainnet.arc.io')

export const config = createConfig({
  chains: [arcTestnet, arc, mainnet], // arc needed for /deploy; mainnet needed for ENS
  // shimDisconnect remembers that you connected, so a reload or an unlocked wallet reconnects without a new prompt.
  connectors: [injected({ shimDisconnect: true })],
  // localStorage, not sessionStorage: the connection survives closing the tab and coming back later.
  storage: createStorage({ storage: typeof window !== 'undefined' ? window.localStorage : undefined, key: 'gasback.wallet' }),
  transports: {
    [arcTestnet.id]: rpcTransport(arcTestnet.id, arcTestnet.rpcUrls.default.http[0]),
    [arc.id]: rpcTransport(arc.id, 'https://rpc.mainnet.arc.io'),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
