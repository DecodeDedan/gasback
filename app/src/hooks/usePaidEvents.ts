import { useEffect, useState, useRef } from 'react';
import { createPublicClient, parseAbiItem, type GetLogsReturnType } from 'viem';
import { NETWORK, rpcTransport } from '@/gasback-config';

export interface PaidEvent {
  merchant: string;
  customer: string;
  amount: bigint;
  orderRef: string;
  rebate: bigint;
  gasUsed: bigint;
  gasPrice: bigint;
  txHash: string;
  blockNumber: bigint;
}

const PAID_EVENT_ABI = parseAbiItem(
  'event Paid(address indexed merchant, address indexed customer, uint256 amount, bytes32 indexed orderRef, uint256 rebate, uint256 gasUsed, uint256 gasPrice)'
);

const PAGE_SIZE = 9_000n;

function getClient() {
  return createPublicClient({ transport: rpcTransport() });
}

function parseLogs(logs: GetLogsReturnType<typeof PAID_EVENT_ABI>): PaidEvent[] {
  return logs.map((log) => ({
    merchant: log.args.merchant!,
    customer: log.args.customer!,
    amount: log.args.amount!,
    orderRef: log.args.orderRef!,
    rebate: log.args.rebate!,
    gasUsed: log.args.gasUsed!,
    gasPrice: log.args.gasPrice!,
    txHash: log.transactionHash ?? '',
    blockNumber: log.blockNumber ?? 0n,
  }));
}

// ---------------------------------------------------------------------------
// In-memory cache so /stats and the ticker share one backfill run per page load
// ---------------------------------------------------------------------------

interface BackfillCache {
  chainId: number;
  contractAddress: string;
  allEvents: PaidEvent[];         // full history, oldest→newest
  cacheHead: bigint;              // highest block we've fetched so far
  syncedToBlock: bigint;          // highest block at last complete pass
  isSyncing: boolean;
  syncPct: number;                // 0–100
}

let _cache: BackfillCache | null = null;
const _listeners: Array<(c: BackfillCache) => void> = [];

function notifyListeners() {
  if (_cache) _listeners.forEach((fn) => fn(_cache!));
}

function getOrInitCache(): BackfillCache {
  if (!_cache || _cache.chainId !== NETWORK.chainId || _cache.contractAddress !== NETWORK.gasbackAddress) {
    _cache = {
      chainId: NETWORK.chainId,
      contractAddress: NETWORK.gasbackAddress,
      allEvents: [],
      cacheHead: NETWORK.deployBlock - 1n,
      syncedToBlock: NETWORK.deployBlock - 1n,
      isSyncing: false,
      syncPct: 0,
    };
  }
  return _cache;
}

// ---------------------------------------------------------------------------
// Background backfill: pages from deployBlock → head in 9k-block windows
// ---------------------------------------------------------------------------

let _backfillRunning = false;

async function runBackfill(merchantFilter?: `0x${string}`) {
  if (_backfillRunning) return;
  _backfillRunning = true;
  const cache = getOrInitCache();
  const client = getClient();

  try {
    const head = await client.getBlockNumber();
    if (head <= cache.cacheHead) {
      // Already up to date — just mark synced
      cache.isSyncing = false;
      cache.syncPct = 100;
      notifyListeners();
      _backfillRunning = false;
      return;
    }

    cache.isSyncing = true;
    const totalBlocks = head - NETWORK.deployBlock;

    // Walk forward from where we left off
    let from = cache.cacheHead + 1n;
    while (from <= head) {
      const to = from + PAGE_SIZE - 1n < head ? from + PAGE_SIZE - 1n : head;
      const logs = await client.getLogs({
        address: NETWORK.gasbackAddress,
        event: PAID_EVENT_ABI,
        args: merchantFilter ? { merchant: merchantFilter } : undefined,
        fromBlock: from,
        toBlock: to,
      });
      const parsed = parseLogs(logs);
      cache.allEvents.push(...parsed);
      cache.cacheHead = to;
      cache.syncPct = totalBlocks > 0n ? Math.min(100, Math.round(Number((to - NETWORK.deployBlock) * 100n / totalBlocks))) : 100;
      notifyListeners();
      from = to + 1n;
    }

    cache.syncedToBlock = head;
    cache.isSyncing = false;
    cache.syncPct = 100;
    notifyListeners();
  } catch {
    cache.isSyncing = false;
    notifyListeners();
  } finally {
    _backfillRunning = false;
  }
}

// Incremental poll: just fetch the new tip since last syncedToBlock
async function pollTip() {
  const cache = getOrInitCache();
  const client = getClient();
  try {
    const head = await client.getBlockNumber();
    if (head <= cache.cacheHead) return;
    const from = cache.cacheHead + 1n;
    const to = head;
    const logs = await client.getLogs({
      address: NETWORK.gasbackAddress,
      event: PAID_EVENT_ABI,
      fromBlock: from,
      toBlock: to,
    });
    const parsed = parseLogs(logs);
    if (parsed.length > 0) {
      cache.allEvents.push(...parsed);
      cache.cacheHead = to;
      notifyListeners();
    } else {
      cache.cacheHead = to;
    }
  } catch {
    // ignore poll errors silently
  }
}

// ---------------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------------

function useCacheSnapshot() {
  const [snap, setSnap] = useState<BackfillCache>(() => getOrInitCache());
  useEffect(() => {
    const fn = (c: BackfillCache) => setSnap({ ...c });
    _listeners.push(fn);
    return () => {
      const idx = _listeners.indexOf(fn);
      if (idx !== -1) _listeners.splice(idx, 1);
    };
  }, []);
  return snap;
}

/**
 * Provides paginated Paid events from full history (deployBlock → head).
 * Shows a syncing indicator while the initial backfill runs.
 */
export function usePaidEvents(opts?: {
  merchantFilter?: `0x${string}`;
  limit?: number;
  pollInterval?: number;
}) {
  const { merchantFilter, limit = 50, pollInterval = 5_000 } = opts ?? {};
  const snap = useCacheSnapshot();
  const started = useRef(false);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void runBackfill(merchantFilter);
    }
    const id = setInterval(() => { void pollTip(); }, pollInterval);
    return () => clearInterval(id);
  }, [merchantFilter, pollInterval]);

  // Filter and return newest-first
  const filtered = snap.allEvents
    .filter((e) => !merchantFilter || e.merchant.toLowerCase() === merchantFilter.toLowerCase())
    .slice()
    .sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : a.blockNumber < b.blockNumber ? 1 : 0))
    .slice(0, limit);

  const totalGasRefunded = snap.allEvents
    .filter((e) => !merchantFilter || e.merchant.toLowerCase() === merchantFilter.toLowerCase())
    .reduce((acc, e) => acc + e.rebate, 0n);

  return {
    events: filtered,
    loading: snap.isSyncing && snap.allEvents.length === 0,
    isSyncing: snap.isSyncing,
    syncPct: snap.syncPct,
    error: null as string | null,
    totalGasRefunded,
    refresh: () => { void pollTip(); },
  };
}

/**
 * Aggregated stats across full history.
 */
export function useStatsEvents() {
  const snap = useCacheSnapshot();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void runBackfill().catch(() => setError('Failed to load history.'));
    }
    const id = setInterval(() => { void pollTip(); }, 5_000);
    return () => clearInterval(id);
  }, []);

  const allEvents = snap.allEvents;
  const merchantSet = new Set(allEvents.map((e) => e.merchant.toLowerCase()));

  const stats = {
    totalPayments: allEvents.length,
    totalVolume: allEvents.reduce((a, e) => a + e.amount, 0n),
    totalGasRefunded: allEvents.reduce((a, e) => a + e.rebate, 0n),
    merchantCount: merchantSet.size,
  };

  const latest50 = allEvents
    .slice()
    .sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1))
    .slice(0, 50);

  return {
    stats,
    events: latest50,
    loading: snap.isSyncing && allEvents.length === 0,
    isSyncing: snap.isSyncing,
    syncPct: snap.syncPct,
    error,
  };
}
