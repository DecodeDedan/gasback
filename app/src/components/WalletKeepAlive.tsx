import { useEffect } from 'react';
import { useAccount, useConfig } from 'wagmi';
import { reconnect } from 'wagmi/actions';

/** How often to re-check while the tab is visible and the wallet is locked or dropped. */
const RETRY_MS = 15_000;

interface Eip1193Events {
  on: (event: 'accountsChanged', listener: (accounts: readonly string[]) => void) => void;
  removeListener: (event: 'accountsChanged', listener: (accounts: readonly string[]) => void) => void;
}

function isEip1193(v: unknown): v is Eip1193Events {
  return typeof v === 'object' && v !== null && 'on' in v && typeof (v as Record<string, unknown>).on === 'function';
}

/**
 * Wallets such as Brave Wallet auto-lock after a few idle minutes and report "no accounts", which wagmi treats as a
 * disconnect. Once you have connected here, this silently reconnects (eth_accounts, never a popup) when the wallet
 * unlocks, when the tab regains focus, and on a slow timer while the page is visible. It renders nothing.
 */
export function WalletKeepAlive() {
  const config = useConfig();
  const { status } = useAccount();

  useEffect(() => {
    if (status !== 'disconnected') return;

    let isCancelled = false;
    async function tryReconnect() {
      if (isCancelled || document.hidden) return;
      const recent = await config.storage?.getItem('recentConnectorId');
      if (!recent) return; // Never connected on this device: leave it to the Connect button.
      await reconnect(config).catch(() => undefined); // A locked wallet just stays disconnected until the next try.
    }

    const rawEthereum: unknown = (window as Window & { ethereum?: unknown }).ethereum;
    const ethereum = isEip1193(rawEthereum) ? rawEthereum : null;
    const handleAccounts = (accounts: readonly string[]) => {
      if (accounts.length > 0) void tryReconnect();
    };
    const handleVisible = () => void tryReconnect();

    ethereum?.on('accountsChanged', handleAccounts);
    window.addEventListener('focus', handleVisible);
    document.addEventListener('visibilitychange', handleVisible);
    const timer = window.setInterval(handleVisible, RETRY_MS);
    void tryReconnect();

    return () => {
      isCancelled = true;
      ethereum?.removeListener('accountsChanged', handleAccounts);
      window.removeEventListener('focus', handleVisible);
      document.removeEventListener('visibilitychange', handleVisible);
      window.clearInterval(timer);
    };
  }, [config, status]);

  return null;
}
