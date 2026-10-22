import { useEffect, useState } from 'react';
import { createPublicClient } from 'viem';
import { rpcTransport } from '@/gasback-config';

/**
 * Polls eth_gasPrice every 15 s and returns the live value in wei.
 * Returns undefined while loading.
 */
export function useLiveGasPrice(): bigint | undefined {
  const [gasPrice, setGasPrice] = useState<bigint | undefined>(undefined);

  useEffect(() => {
    const client = createPublicClient({ transport: rpcTransport() });

    async function fetch() {
      try {
        const gp = await client.getGasPrice();
        setGasPrice(gp);
      } catch {
        // ignore — keep previous value
      }
    }

    void fetch();
    const id = setInterval(() => { void fetch(); }, 15_000);
    return () => clearInterval(id);
  }, []);

  return gasPrice;
}
