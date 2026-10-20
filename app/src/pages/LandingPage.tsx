import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { LiveTicker } from '@/components/LiveTicker';
import { GasbackHero } from '@/components/hero/GasbackHero';
import { Meter } from '@/components/Meter';
import { useLiveGasPrice } from '@/hooks/useGasPrice';
import { formatUsdcGas, gasCostToUsdc } from '@/utils/format';

/** Gas a real Gasback pay() used on Arc (measured on the testnet fork). */
const PAY_GAS = 62_038n;

const steps = [
  {
    n: '1',
    title: 'The merchant funds a gas pool',
    body: 'A few dollars of USDC and a cap per checkout. No admin, no keeper: the pool sits in the Gasback contract until a buyer pays.',
  },
  {
    n: '2',
    title: 'The buyer pays the sticker price',
    body: 'One pay() call. The full amount goes to the merchant, and the contract measures the gas it burned on the way.',
  },
  {
    n: '3',
    title: 'Gas comes back in the same transaction',
    body: 'Arc charges gas in USDC, so the refund needs no oracle. The receipt shows it: paid, burned, refunded, net.',
  },
];

function ItemisedCheckout() {
  const gasPrice = useLiveGasPrice();
  const gas = gasPrice != null ? formatUsdcGas(gasCostToUsdc(PAY_GAS, gasPrice)) : '…';

  return (
    <div className="pump p-5 sm:p-7 grid gap-4" aria-live="polite">
      <Meter label="Sale" value="$5.000000" size="lg" />
      <div className="h-px bg-line/60" aria-hidden="true" />
      <Meter label="Gas burned on Arc" value={gas} tone="gas" size="sm" />
      <Meter label="Refunded by the merchant" value={gas} tone="refund" size="sm" sign="−" />
      <div className="h-px bg-line/60" aria-hidden="true" />
      <Meter label="Buyer spends" value="$5.000000" tone="gas" size="md" />
      <p className="m-0 text-xs text-muted">Gas priced at the live Arc base fee for one pay() ({PAY_GAS.toLocaleString('en-US')} gas).</p>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-dvh">
      <GasbackHero />

      <section aria-labelledby="itemised-title" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid gap-10 lg:grid-cols-2 items-center">
        <div className="grid gap-5 max-w-xl">
          <h2 id="itemised-title" className="m-0 text-ink text-3xl sm:text-4xl leading-tight">
            One checkout, itemised.
          </h2>
          <p className="m-0 text-muted text-lg leading-relaxed">
            On other chains, &ldquo;$5&rdquo; means $5 plus gas in a token you may not even hold. On Arc the fee is USDC, the same money as
            the payment, so a contract can pay it back exactly, to the cent and below.
          </p>
          <Link to="/merchant" className="btn-line w-fit">
            Offer gas-free checkout
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <ItemisedCheckout />
      </section>

      <section aria-labelledby="how-title" className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        <h2 id="how-title" className="m-0 mb-10 text-ink text-3xl sm:text-4xl">
          How it works
        </h2>
        <ol className="relative m-0 p-0 list-none grid gap-10 md:grid-cols-3 md:gap-8">
          {/* The flow line: amber where money leaves, green where it comes back. */}
          <span
            aria-hidden="true"
            className="absolute left-[1.35rem] top-2 bottom-2 w-px md:left-0 md:right-0 md:top-[1.6rem] md:bottom-auto md:w-auto md:h-px bg-gradient-to-b md:bg-gradient-to-r from-gas via-gas/60 to-refund"
          />
          {steps.map((step) => (
            <li key={step.n} className="relative grid grid-cols-[2.75rem_1fr] gap-4 md:grid-cols-1 md:gap-5">
              <span className="relative z-10 grid place-items-center w-11 h-11 md:w-[3.25rem] md:h-[3.25rem] rounded-full bg-page border border-gas/60 text-gas font-display text-2xl">
                {step.n}
              </span>
              <div className="grid gap-2">
                <h3 className="m-0 text-ink text-xl leading-snug">{step.title}</h3>
                <p className="m-0 text-muted leading-relaxed max-w-[38ch]">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Latest refunds" className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <LiveTicker />
      </section>

      <footer className="border-t border-line/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-sm text-muted">
          <span className="flex items-center gap-2">
            <img src="/gasback-mark.svg" alt="" width={20} height={20} />
            Gasback · the price is the price
          </span>
          <span>
            Built on Arc with Arc Studio · by{' '}
            <a href="https://okwaretech.com" target="_blank" rel="noopener noreferrer" className="text-ink hover:text-gas">
              okwaretech.com
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
