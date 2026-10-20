import { useState } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import type { Abi, ContractFunctionArgs, ContractFunctionName } from 'viem';
import { NETWORK } from '@/gasback-config';

/** Priority tip. Arc's base fee does the work; a big wallet-chosen tip would push the price past Gasback's refund cap. */
const TIP_WEI = 1_000_000_000n;
/** Headroom over the estimate, so a busy block never runs the transaction out of gas. */
const GAS_HEADROOM_PERCENT = 120n;

type WriteRequest<abi extends Abi, name extends ContractFunctionName<abi, 'nonpayable' | 'payable'>> = {
  address: `0x${string}`;
  abi: abi;
  functionName: name;
  args: ContractFunctionArgs<abi, 'nonpayable' | 'payable', name>;
};

/**
 * useWriteContract, with every transaction prepared here instead of by the wallet:
 * it is simulated first (a revert shows its reason and never opens the wallet), given an explicit gas limit
 * (Brave Wallet cannot estimate on Arc and shows "Missing gas limit"), and priced at base fee + a 1 gwei tip,
 * so what the buyer pays stays inside the refund cap and the refund matches the real fee.
 */
export function usePreparedWrite() {
  const { address } = useAccount();
  const client = usePublicClient({ chainId: NETWORK.chainId });
  const write = useWriteContract();
  const [prepareError, setPrepareError] = useState<Error | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);

  async function send<abi extends Abi, name extends ContractFunctionName<abi, 'nonpayable' | 'payable'>>(
    request: WriteRequest<abi, name>,
  ): Promise<void> {
    if (!client || !address) {
      setPrepareError(new Error('Wallet not connected.'));
      return;
    }
    setPrepareError(null);
    setIsPreparing(true);
    try {
      const call = { ...request, account: address } as Parameters<typeof client.simulateContract>[0];
      await client.simulateContract(call);
      const [gas, block] = await Promise.all([
        // Same object as the simulation; viem types its fee fields differently per action, hence the cast.
        client.estimateContractGas(call as unknown as Parameters<typeof client.estimateContractGas>[0]),
        client.getBlock(),
      ]);
      const baseFee = block.baseFeePerGas ?? (await client.getGasPrice());
      // EIP-1559 fields on a generic request; wagmi's union type cannot follow the generic, hence the single cast.
      write.writeContract({
        ...request,
        chainId: NETWORK.chainId,
        gas: (gas * GAS_HEADROOM_PERCENT) / 100n,
        maxPriorityFeePerGas: TIP_WEI,
        maxFeePerGas: baseFee * 2n + TIP_WEI,
      } as unknown as Parameters<typeof write.writeContract>[0]);
    } catch (err: unknown) {
      setPrepareError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsPreparing(false);
    }
  }

  function reset() {
    setPrepareError(null);
    write.reset();
  }

  return {
    send,
    reset,
    data: write.data,
    isPending: write.isPending || isPreparing,
    error: prepareError ?? write.error,
  };
}
