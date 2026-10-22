// Read-only check of Gasback payments on Arc mainnet: for each Paid event, compare the rebate with the real fee
// (gasUsed × effectiveGasPrice from the receipt). Run from the app folder:
//   node scripts/verify-mainnet-paid.ts            (scans every Paid event since the deploy block)
//   node scripts/verify-mainnet-paid.ts 0x<txhash> (checks one payment)
import { createPublicClient, http, formatUnits, parseEventLogs, isHash, type Hash } from 'viem';
import { GASBACK_ABI } from '../src/gasback-abi.ts';

const GASBACK = '0x6389e393197d575f0cf737f3d063b9f6eefc8202' as const;
const DEPLOY_BLOCK = 26_928_006n;
const EXPLORER = 'https://explorer.arc.io';
// Arc's RPC rejects eth_getLogs spans above 10,000 blocks and rate-limits bursts, hence the chunking and retries.
const LOG_SPAN = 10_000n;
const MAX_DEVIATION_PCT = 5;

const pub = createPublicClient({ transport: http('https://rpc.mainnet.arc.io', { timeout: 30_000, retryCount: 8, retryDelay: 2_000 }) });
const usd = (v: bigint) => `$${formatUnits(v, 6)}`;

async function paidTxHashes(): Promise<Hash[]> {
  const head = await pub.getBlockNumber();
  const hashes: Hash[] = [];
  for (let from = DEPLOY_BLOCK; from <= head; from += LOG_SPAN) {
    const to = from + LOG_SPAN - 1n > head ? head : from + LOG_SPAN - 1n;
    const logs = await pub.getContractEvents({ address: GASBACK, abi: GASBACK_ABI, eventName: 'Paid', fromBlock: from, toBlock: to });
    hashes.push(...logs.map((l) => l.transactionHash));
  }
  return [...new Set(hashes)];
}

/** Returns true when the payment's rebate is within MAX_DEVIATION_PCT of the fee the buyer actually paid. */
async function verify(hash: Hash): Promise<boolean> {
  const receipt = await pub.getTransactionReceipt({ hash });
  const paid = parseEventLogs({ abi: GASBACK_ABI, eventName: 'Paid', logs: receipt.logs }).find(
    (l) => l.address.toLowerCase() === GASBACK,
  );
  if (receipt.status !== 'success' || !paid) {
    process.stdout.write(`FAIL  ${hash}  ${receipt.status !== 'success' ? 'reverted' : 'no Paid event from Gasback'}\n`);
    return false;
  }
  const { merchant, customer, amount, rebate, gasUsed } = paid.args;
  // Native USDC gas is 18-decimal; the ERC-20 view (and the rebate) is 6-decimal.
  const fee6 = (receipt.gasUsed * receipt.effectiveGasPrice) / 10n ** 12n;
  const deviation = fee6 === 0n ? 0 : (Number(rebate - fee6) / Number(fee6)) * 100;
  const ok = Math.abs(deviation) <= MAX_DEVIATION_PCT;
  process.stdout.write(
    `${ok ? 'PASS' : 'FAIL'}  ${EXPLORER}/tx/${hash}\n` +
      `      block ${receipt.blockNumber}  merchant ${merchant}  customer ${customer}\n` +
      `      amount ${usd(amount)}  fee ${usd(fee6)}  rebate ${usd(rebate)} (${deviation.toFixed(2)}%)  ` +
      `gasUsed tx ${receipt.gasUsed} / in-contract ${gasUsed}\n`,
  );
  return ok;
}

const arg = process.argv[2];
if (arg !== undefined && !isHash(arg)) {
  process.stderr.write(`Not a transaction hash: ${arg}\n`);
  process.exit(2);
}
const hashes = arg ? [arg] : await paidTxHashes();
if (hashes.length === 0) {
  process.stdout.write(`No Paid events on ${GASBACK} since block ${DEPLOY_BLOCK}.\n`);
  process.exit(1);
}
let allOk = true;
for (const h of hashes) allOk = (await verify(h)) && allOk;
process.exit(allOk ? 0 : 1);
