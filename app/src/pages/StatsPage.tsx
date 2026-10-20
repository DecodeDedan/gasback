import { useStatsEvents } from '@/hooks/usePaidEvents';
import { shortAddr, formatUsdc, formatUsdcGas, buildTxUrl, buildAddrUrl } from '@/utils/format';
import { ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { Meter } from '@/components/Meter';

export function StatsPage() {
  const { stats, events, loading, isSyncing, syncPct, error } = useStatsEvents();

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="m-0 text-ink text-3xl sm:text-4xl">Every refund, on the record</h1>
        <span className="flex items-center gap-1.5 text-sm text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-refund motion-safe:animate-pulse" aria-hidden="true" />
          Live from Arc
        </span>
      </div>

      {/* Syncing progress bar */}
      {isSyncing && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] font-mono text-muted">
            <span>Syncing history from deploy block…</span>
            <span className="text-gas">{syncPct}%</span>
          </div>
          <div className="h-1 w-full rounded-full bg-line overflow-hidden">
            <div
              className="h-full bg-gas rounded-full origin-left motion-safe:transition-transform motion-safe:duration-300"
              style={{ transform: `scaleX(${syncPct / 100})` }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="pump h-56 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading totals" />
      ) : error ? (
        <div className="text-danger text-sm">{error}</div>
      ) : (
        <div className="pump p-5 sm:p-7 grid gap-4">
          <Meter label="Volume paid through Gasback" value={formatUsdc(stats.totalVolume, 2)} size="lg" />
          <div className="h-px bg-line/60" aria-hidden="true" />
          <Meter label="Gas refunded to buyers" value={formatUsdcGas(stats.totalGasRefunded)} tone="refund" size="md" />
          <Meter label="Payments" value={stats.totalPayments.toLocaleString('en-US')} size="sm" />
          <Meter label="Merchants" value={stats.merchantCount.toLocaleString('en-US')} size="sm" />
        </div>
      )}

      {/* Event table */}
      <div className="panel overflow-hidden">
        <div className="px-5 py-3 border-b border-line flex items-center justify-between">
          <h2 className="m-0 text-ink text-lg">Latest 50 payments</h2>
          {isSyncing && !loading && (
            <span className="text-[10px] font-mono text-gas">syncing… {syncPct}%</span>
          )}
        </div>

        {/* Header */}
        <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-3 px-5 py-2 border-b border-line text-sm text-muted">
          <span>Customer</span>
          <span>Merchant</span>
          <span>Amount</span>
          <span>Gas burned</span>
          <span>Rebate</span>
          <span />
        </div>

        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-3 animate-pulse flex gap-3">
              <div className="flex-1 h-3 rounded bg-line" />
              <div className="w-20 h-3 rounded bg-line" />
            </div>
          ))
        ) : events.length === 0 ? (
          <div className="px-5 py-10 text-center text-muted text-sm">No payments yet.</div>
        ) : (
          events.map((e, i) => (
            <motion.div
              key={e.txHash + i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.02, duration: 0.2 }}
              className="grid sm:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-3 px-5 py-3 border-b border-line last:border-0 text-xs hover:bg-page/60 transition-colors items-center"
            >
              <span className="font-mono text-muted tabular-nums">
                <a href={buildAddrUrl(e.customer)} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
                  {shortAddr(e.customer)}
                </a>
              </span>
              <span className="font-mono text-muted tabular-nums">
                <a href={buildAddrUrl(e.merchant)} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
                  {shortAddr(e.merchant)}
                </a>
              </span>
              <span className="font-mono text-ink tabular-nums">{formatUsdc(e.amount, 2)}</span>
              <span className="font-mono text-gas tabular-nums">{formatUsdcGas(e.gasUsed * e.gasPrice / 10n ** 12n)}</span>
              <span className="font-mono text-refund tabular-nums">+{formatUsdcGas(e.rebate)}</span>
              <a
                href={buildTxUrl(e.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted hover:text-ink transition-colors"
                aria-label="View transaction"
              >
                <ExternalLink size={13} />
              </a>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
