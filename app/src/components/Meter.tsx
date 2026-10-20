type Tone = 'ink' | 'gas' | 'refund';
type Size = 'sm' | 'md' | 'lg';

type Props = {
  label: string;
  /** A formatted amount such as "$5.000000" or "$0.001240". */
  value: string;
  tone?: Tone;
  size?: Size;
  sign?: '+' | '−';
};

const TONE: Record<Tone, string> = { ink: 'text-ink', gas: 'text-gas', refund: 'text-refund' };
const SIZE: Record<Size, string> = { sm: 'text-lg', md: 'text-2xl sm:text-3xl', lg: 'text-4xl sm:text-5xl' };

/**
 * Splits an amount the way a fuel pump lights its digits: the significant part bright,
 * the unused zeros (leading "0.00" and trailing padding) dim, so the figure that matters reads first.
 */
export function splitDigits(value: string): { lead: string; core: string; tail: string } {
  const match = /^(\$?)(0?[.,]?0*)(.*?)(0*)$/.exec(value);
  if (!match) return { lead: '', core: value, tail: '' };
  const [, symbol, zeros, core, tail] = match;
  if (!core) return { lead: symbol + zeros.slice(0, -1), core: zeros.slice(-1) || '0', tail };
  return { lead: symbol + zeros, core, tail };
}

/** A pump-display readout: label on the left, digits on the right, tabular so rows align. */
export function Meter({ label, value, tone = 'ink', size = 'md', sign }: Props) {
  const { lead, core, tail } = splitDigits(value);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 min-w-0">
      <span className="text-muted text-sm shrink-0">{label}</span>
      <span className={`ml-auto font-mono tabular-nums font-semibold tracking-tight whitespace-nowrap ${SIZE[size]} ${TONE[tone]}`} aria-label={`${sign ?? ''}${value}`}>
        {sign && <span aria-hidden="true">{sign}</span>}
        <span className="opacity-40" aria-hidden="true">{lead}</span>
        <span aria-hidden="true">{core}</span>
        <span className="opacity-40" aria-hidden="true">{tail}</span>
      </span>
    </div>
  );
}
