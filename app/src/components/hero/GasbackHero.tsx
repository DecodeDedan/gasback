import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Store } from 'lucide-react';
import { createPublicClient } from 'viem';
import { NETWORK, rpcTransport } from '@/gasback-config';
import { RefundLoop } from './RefundLoop';

interface ChainReading {
  block: bigint;
  baseFee: bigint;
}

const CHAIN_POLL_MS = 2_000;
/** Gas a real Gasback pay() used on Arc (measured by Arc Studio on the testnet fork). */
const PAY_GAS = 62_038n;
const WEI_PER_MICRO_USD = 10n ** 12n;
const EXAMPLE_AMOUNT = '$5.00';

const demoMerchant = import.meta.env.VITE_DEMO_MERCHANT as string | undefined;
const hasDemoMerchant = Boolean(demoMerchant && /^0x[0-9a-fA-F]{40}$/.test(demoMerchant));

function formatGwei(wei: bigint): string {
  return `${(Number(wei) / 1e9).toFixed(2)} gwei`;
}

/** Cost of one pay() at this base fee, in dollars: native USDC has 18 decimals. */
function formatPayCost(baseFee: bigint): string {
  const microUsd = (PAY_GAS * baseFee) / WEI_PER_MICRO_USD;
  return `$${(Number(microUsd) / 1e6).toFixed(6)}`;
}

function useChainReading(): { reading: ChainReading | null; isLive: boolean } {
  const [reading, setReading] = useState<ChainReading | null>(null);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const client = createPublicClient({ transport: rpcTransport() });
    let isCancelled = false;

    async function poll() {
      try {
        const block = await client.getBlock();
        if (isCancelled) return;
        setReading({ block: block.number, baseFee: block.baseFeePerGas ?? 0n });
        setIsLive(true);
      } catch {
        // Keep the last reading on screen and show the line as paused until the next poll succeeds.
        if (!isCancelled) setIsLive(false);
      }
    }

    void poll();
    const id = window.setInterval(() => void poll(), CHAIN_POLL_MS);
    return () => {
      isCancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return { reading, isLive };
}

export function GasbackHero() {
  const { reading, isLive } = useChainReading();
  const gasLabel = reading ? formatPayCost(reading.baseFee) : null;

  return (
    <section aria-labelledby="hero-title" className="relative overflow-clip">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-16 lg:pt-20 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-center">
        <div className="grid gap-6 order-2 lg:order-1">
          <p className="kicker">Gas refunds · {NETWORK.chainName}</p>
          <h1
            id="hero-title"
            className="m-0 text-ink"
            style={{ fontSize: 'var(--display-hero)', lineHeight: 0.9, letterSpacing: '-0.035em', maxWidth: '9ch' }}
          >
            The price is <span className="text-gas">the price.</span>
          </h1>
          <p className="m-0 text-muted max-w-[46ch]" style={{ fontSize: 'var(--text-lg)', lineHeight: 'var(--leading-lg)' }}>
            On Arc, gas is paid in USDC. So a merchant can refund your exact gas fee inside the same payment, with no oracle. Pay $5.00,
            spend $5.00.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/merchant"
              className="inline-flex items-center gap-2 px-5 h-11 rounded-full bg-gas text-gas-fg font-semibold text-sm hover:bg-gas-hover transition-colors"
            >
              <Store size={16} aria-hidden="true" />
              I'm a merchant
            </Link>
            {hasDemoMerchant && (
              <Link
                to={`/pay/${demoMerchant}?amount=0.1&ref=demo`}
                className="inline-flex items-center gap-2 px-5 h-11 rounded-full border border-line text-ink text-sm hover:border-refund hover:text-refund transition-colors"
              >
                Try a $0.10 checkout
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>

        <div className="order-1 lg:order-2 grid gap-4">
          <RefundLoop gasLabel={gasLabel} amountLabel={EXAMPLE_AMOUNT} />
          <dl className="m-0 flex flex-wrap justify-center gap-x-6 gap-y-2 font-mono text-xs text-muted" aria-live="polite">
            <div className="flex gap-2">
              <dt>status</dt>
              <dd className={`m-0 ${isLive ? 'text-refund' : 'text-muted'}`}>{isLive ? '● live' : reading ? 'Ⅱ paused' : '○ connecting'}</dd>
            </div>
            <div className="flex gap-2">
              <dt>block</dt>
              <dd className="m-0 text-ink">{reading ? reading.block.toLocaleString('en-US') : '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt>base fee</dt>
              <dd className="m-0 text-ink">{reading ? formatGwei(reading.baseFee) : '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt>buyer's net cost</dt>
              <dd className="m-0 text-gas">$5.000000</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
