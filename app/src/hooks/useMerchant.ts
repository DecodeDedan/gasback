import { useReadContract } from 'wagmi';
import { erc20Abi } from 'viem';
import { NETWORK } from '@/gasback-config';
import { GASBACK_ABI } from '@/gasback-abi';

export function useMerchantData(address?: `0x${string}`) {
  const result = useReadContract({
    address: NETWORK.gasbackAddress,
    abi: GASBACK_ABI,
    functionName: 'merchants',
    args: address ? [address] : undefined,
    chainId: NETWORK.chainId,
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  const [pool, maxRebatePerTx, maxGasPrice, exists] = (result.data as [bigint, bigint, bigint, boolean] | undefined) ?? [0n, 0n, 0n, false];

  return {
    pool,
    maxRebatePerTx,
    maxGasPrice,
    exists,
    // Loading only until the first answer; later failed refetches keep the last good data instead of blanking the page.
    isLoading: result.data === undefined && !result.isError,
    error: result.data === undefined ? result.error : null,
    refetch: result.refetch,
  };
}

export function useUsdcBalance(address?: `0x${string}`) {
  return useReadContract({
    address: NETWORK.usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: NETWORK.chainId,
    query: { enabled: !!address, refetchInterval: 5_000 },
  });
}

export function useUsdcAllowance(owner?: `0x${string}`) {
  return useReadContract({
    address: NETWORK.usdcAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: owner ? [owner, NETWORK.gasbackAddress] : undefined,
    chainId: NETWORK.chainId,
    query: { enabled: !!owner, refetchInterval: 3_000 },
  });
}

export function useQuoteRebate(merchant?: `0x${string}`, estGas?: bigint, gasPrice?: bigint) {
  return useReadContract({
    address: NETWORK.gasbackAddress,
    abi: GASBACK_ABI,
    functionName: 'quoteRebate',
    args: merchant && estGas != null && gasPrice != null ? [merchant, estGas, gasPrice] : undefined,
    chainId: NETWORK.chainId,
    query: { enabled: !!merchant && estGas != null && gasPrice != null, refetchInterval: 10_000 },
  });
}
