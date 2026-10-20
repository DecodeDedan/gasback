// End-to-end Gasback test on Arc Testnet with two throwaway wallets. Run from the app folder:
//   E2E_KEYS=/path/to/keys.json node scripts/e2e-testnet.ts   (keys: {"merchant":"0x..","buyer":"0x.."}, testnet only, never committed)
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, erc20Abi, formatUnits, decodeEventLog, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet } from 'viem/chains';
import { GASBACK_ABI } from '../src/gasback-abi.ts';

const GASBACK = '0xc0ad33f01758f9d0e15f4dc4c8ddfbc998477df0' as const;
const USDC = '0x3600000000000000000000000000000000000000' as const;
const TIP = 1_000_000_000n;
const keys = JSON.parse(fs.readFileSync(process.env.E2E_KEYS ?? '', 'utf8')) as { merchant: Hex; buyer: Hex };
const merchant = privateKeyToAccount(keys.merchant);
const buyer = privateKeyToAccount(keys.buyer);
const pub = createPublicClient({ chain: arcTestnet, transport: http(undefined, { timeout: 30_000 }) });
const wallet = (acct: typeof merchant) => createWalletClient({ account: acct, chain: arcTestnet, transport: http(undefined, { timeout: 30_000 }) });
const usd = (v: bigint) => `$${formatUnits(v, 6)}`;
const results: Array<[string, boolean, string]> = [];
const check = (name: string, ok: boolean, detail: string) => {
  results.push([name, ok, detail]);
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}\n`);
};
const bal = (a: `0x${string}`) => pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [a] });
const merchantState = () => pub.readContract({ address: GASBACK, abi: GASBACK_ABI, functionName: 'merchants', args: [merchant.address] });

/** Same preparation as the app's usePreparedWrite: simulate, explicit gas, base fee + 1 gwei tip. */
async function send(acct: typeof merchant, req: { address: `0x${string}`; abi: unknown; functionName: string; args: readonly unknown[] }) {
  const call = { ...req, account: acct } as never;
  await pub.simulateContract(call);
  const gas = await pub.estimateContractGas(call);
  const block = await pub.getBlock();
  const hash = await wallet(acct).writeContract({ ...(req as object), gas: (gas * 120n) / 100n, maxPriorityFeePerGas: TIP, maxFeePerGas: block.baseFeePerGas! * 2n + TIP } as never);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`${req.functionName} reverted: ${hash}`);
  return receipt;
}

async function expectRevert(name: string, acct: typeof merchant, req: { address: `0x${string}`; abi: unknown; functionName: string; args: readonly unknown[] }, errorName: string) {
  try {
    await pub.simulateContract({ ...req, account: acct } as never);
    check(name, false, 'did not revert');
  } catch (err) {
    const msg = (err as Error).message;
    check(name, msg.includes(errorName), msg.includes(errorName) ? `reverts with ${errorName}` : msg.split('\n')[0]);
  }
}

const mBal = await bal(merchant.address);
const bBal = await bal(buyer.address);
console.log(`merchant ${merchant.address} ${usd(mBal)} | buyer ${buyer.address} ${usd(bBal)}`);
if (mBal < 1_200_000n) throw new Error('Test merchant needs at least $1.20 testnet USDC.');

// Seed the buyer from the merchant if only the merchant was funded.
if (bBal < 300_000n) {
  await send(merchant, { address: USDC, abi: erc20Abi, functionName: 'transfer', args: [buyer.address, 500_000n] });
  console.log('seeded buyer with $0.50');
}

// 1. Register
let state = await merchantState();
if (!state[3]) {
  const gp = await pub.getGasPrice();
  await send(merchant, { address: GASBACK, abi: GASBACK_ABI, functionName: 'registerMerchant', args: [50_000n, gp * 3n] });
}
state = await merchantState();
check('register', state[3] === true && state[1] === 50_000n, `exists=${state[3]} maxRebate=${usd(state[1])} maxGasPrice=${Number(state[2]) / 1e9} gwei`);
await expectRevert('double register blocked', merchant, { address: GASBACK, abi: GASBACK_ABI, functionName: 'registerMerchant', args: [50_000n, 1n] }, 'AlreadyRegistered');

// 2. Fund the pool
const poolBefore = state[0];
await send(merchant, { address: USDC, abi: erc20Abi, functionName: 'approve', args: [GASBACK, 500_000n] });
await send(merchant, { address: GASBACK, abi: GASBACK_ABI, functionName: 'fundPool', args: [500_000n] });
state = await merchantState();
check('fund pool', state[0] === poolBefore + 500_000n, `pool ${usd(poolBefore)} -> ${usd(state[0])}`);

// 3. Buyer pays $0.10 and gets gas back in the same transaction
const AMOUNT = 100_000n;
await send(buyer, { address: USDC, abi: erc20Abi, functionName: 'approve', args: [GASBACK, AMOUNT] });
const [mUsdBefore, bUsdBefore, bNativeBefore] = await Promise.all([bal(merchant.address), bal(buyer.address), pub.getBalance({ address: buyer.address })]);
const orderRef = `0x${Buffer.from('e2e-order-1'.padEnd(32, '\0')).toString('hex')}` as Hex;
const payReceipt = await send(buyer, { address: GASBACK, abi: GASBACK_ABI, functionName: 'pay', args: [merchant.address, AMOUNT, orderRef] });
const paid = payReceipt.logs
  .filter((l) => l.address.toLowerCase() === GASBACK)
  .map((l) => decodeEventLog({ abi: GASBACK_ABI, data: l.data, topics: l.topics }))
  .find((e) => e.eventName === 'Paid');
const [mUsdAfter] = await Promise.all([bal(merchant.address)]);
const fee6 = (payReceipt.gasUsed * payReceipt.effectiveGasPrice) / 10n ** 12n;
const rebate = (paid?.args as { rebate: bigint } | undefined)?.rebate ?? 0n;
const deviation = fee6 === 0n ? 0 : (Number(rebate - fee6) / Number(fee6)) * 100;
check('merchant receives exact amount', mUsdAfter - mUsdBefore === AMOUNT, `+${usd(mUsdAfter - mUsdBefore)}`);
check('Paid event emitted', Boolean(paid), `tx ${payReceipt.transactionHash}`);
check('refund within ±5% of real fee', Math.abs(deviation) <= 5, `fee ${usd(fee6)} rebate ${usd(rebate)} (${deviation.toFixed(2)}%)`);
const bNativeAfter = await pub.getBalance({ address: buyer.address });
const netCost18 = bNativeBefore - bNativeAfter; // native balance moves by amount + fee - rebate
check('buyer net cost ≈ sticker price', Math.abs(Number(netCost18 - AMOUNT * 10n ** 12n)) / 1e18 < 0.0005, `net ${formatUnits(netCost18, 18).slice(0, 10)} vs ${usd(AMOUNT)}; ERC-20 view ${usd(bUsdBefore)} -> ${usd(await bal(buyer.address))}`);
state = await merchantState();
check('pool paid the rebate', state[0] === poolBefore + 500_000n - rebate, `pool ${usd(state[0])}`);

// 4. Failure paths
await expectRevert('self-pay blocked', merchant, { address: GASBACK, abi: GASBACK_ABI, functionName: 'pay', args: [merchant.address, 1n, orderRef] }, 'SelfPay');
await expectRevert('zero amount blocked', buyer, { address: GASBACK, abi: GASBACK_ABI, functionName: 'pay', args: [merchant.address, 0n, orderRef] }, 'ZeroAmount');
await expectRevert('unregistered merchant blocked', buyer, { address: GASBACK, abi: GASBACK_ABI, functionName: 'pay', args: [buyer.address, 1n, orderRef] }, 'UnregisteredMerchant');
await expectRevert('over-withdraw blocked', merchant, { address: GASBACK, abi: GASBACK_ABI, functionName: 'withdrawPool', args: [state[0] + 1n] }, 'InsufficientPool');

// 5. Withdraw part of the pool
const before = state[0];
await send(merchant, { address: GASBACK, abi: GASBACK_ABI, functionName: 'withdrawPool', args: [100_000n] });
state = await merchantState();
check('withdraw', state[0] === before - 100_000n, `pool ${usd(before)} -> ${usd(state[0])}`);

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
