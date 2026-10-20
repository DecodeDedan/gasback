import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { usePaidEvents } from '@/hooks/usePaidEvents';
import { shortAddr, formatUsdc, formatUsdcGas, buildTxUrl } from '@/utils/format';
import { ExternalLink, Zap } from 'lucide-react';

export function LiveTicker() {
  const { events, loading, totalGasRefunded } = usePaidEvents({ limit: 8, pollInterval: 5_000 });
  const reduced = useReducedMotion();

  return (
    <div className="panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-refund animate-pulse" />
          <span className="text-sm text-muted">Live Feed</span>
        </div>
        <div className="flex items-center gap-1.5 text-refund">
          <Zap size={12} />
          <span className="font-mono text-xs tabular-nums">
            {formatUsdcGas(totalGasRefunded)} refunded
          </span>
        </div>
      </div>

      {/* Events */}
      <div className="divide-y divide-line">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex gap-3 animate-pulse">
              <div className="w-20 h-3 rounded bg-line" />
              <div className="flex-1 h-3 rounded bg-line" />
              <div className="w-16 h-3 rounded bg-line" />
            </div>
          ))
        ) : events.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted text-sm">No payments yet.</div>
        ) : (
          <AnimatePresence initial={false}>
            {events.map((e) => (
              <motion.div
                key={e.txHash + e.blockNumber}
                initial={reduced ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.24 }}
                className="px-4 py-3 flex items-center gap-3 text-xs hover:bg-page/60 transition-colors"
              >
                <span className="font-mono text-muted tabular-nums">{shortAddr(e.customer)}</span>
                <span className="text-muted">→</span>
                <span className="font-mono text-muted tabular-nums">{shortAddr(e.merchant)}</span>
                <span className="flex-1 text-center font-mono text-ink tabular-nums">
                  {formatUsdc(e.amount, 2)}
                </span>
                <span className="font-mono text-refund tabular-nums">
                  +{formatUsdcGas(e.rebate)}
                </span>
                {e.txHash && (
                  <a
                    href={buildTxUrl(e.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted hover:text-gas focus:outline-none focus-visible:ring-1 focus-visible:ring-gas rounded"
                    aria-label="View transaction"
                  >
                    <ExternalLink size={11} />
                  </a>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
