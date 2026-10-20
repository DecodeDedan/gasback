import { useAccount, useSwitchChain } from 'wagmi';
import { NETWORK } from '@/gasback-config';
import { switchErrorMessage } from '@/utils/format';

export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { chainId, isConnected } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();

  if (!isConnected) return <>{children}</>;

  if (chainId !== NETWORK.chainId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <div className="text-muted text-sm">Wrong network</div>
        <div className="text-ink text-lg">Switch to {NETWORK.chainName}</div>
        <button
          onClick={() => switchChain({ chainId: NETWORK.chainId })}
          disabled={isPending}
          className="btn-gas"
        >
          {isPending ? 'Switching…' : `Switch to ${NETWORK.chainName}`}
        </button>
        {error && (
          <p className="m-0 max-w-md text-center text-sm text-warning" role="alert">
            {switchErrorMessage(error)}
          </p>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
