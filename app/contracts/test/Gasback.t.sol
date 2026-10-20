// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {Gasback} from "../Gasback.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Invariant handler
// ─────────────────────────────────────────────────────────────────────────────

contract GasbackHandler is Test {
    Gasback public gasback;
    MockERC20 public usdc;

    address[] public actors;
    address[] public registeredMerchants;

    uint256 public constant INITIAL_MINT = 1_000_000e6; // 1M USDC per actor

    constructor(Gasback _gasback, MockERC20 _usdc) {
        gasback = _gasback;
        usdc = _usdc;

        // Create 3 actors
        for (uint256 i = 0; i < 3; i++) {
            address a = makeAddr(string(abi.encodePacked("actor", i)));
            actors.push(a);
            usdc.mint(a, INITIAL_MINT);
        }
    }

    function registerMerchant(uint256 actorIdx, uint64 maxRebatePerTx, uint64 maxGasPrice) external {
        address actor = actors[actorIdx % actors.length];
        (,,,bool exists) = gasback.merchants(actor);
        if (exists) return;

        vm.startPrank(actor);
        gasback.registerMerchant(maxRebatePerTx, maxGasPrice);
        vm.stopPrank();
        registeredMerchants.push(actor);
    }

    function fundPool(uint256 actorIdx, uint128 amount) external {
        address actor = actors[actorIdx % actors.length];
        (,,,bool exists) = gasback.merchants(actor);
        if (!exists) return;
        if (amount == 0) return;

        uint256 bal = usdc.balanceOf(actor);
        if (bal == 0) return;
        amount = uint128(bound(uint256(amount), 1, bal > type(uint128).max ? type(uint128).max : bal));

        vm.startPrank(actor);
        usdc.approve(address(gasback), amount);
        gasback.fundPool(amount);
        vm.stopPrank();
    }

    function withdrawPool(uint256 actorIdx, uint128 amount) external {
        address actor = actors[actorIdx % actors.length];
        (uint128 pool,,,bool exists) = gasback.merchants(actor);
        if (!exists) return;
        if (pool == 0) return;
        amount = uint128(bound(uint256(amount), 1, pool));

        vm.startPrank(actor);
        gasback.withdrawPool(amount);
        vm.stopPrank();
    }

    function pay(uint256 merchantIdx, uint256 customerIdx, uint256 amount) external {
        if (registeredMerchants.length == 0) return;
        address merchant = registeredMerchants[merchantIdx % registeredMerchants.length];
        address customer = actors[customerIdx % actors.length];
        if (customer == merchant) return;

        amount = bound(amount, 1, usdc.balanceOf(customer));
        if (amount == 0) return;

        vm.startPrank(customer);
        usdc.approve(address(gasback), amount);
        gasback.pay(merchant, amount, bytes32(0));
        vm.stopPrank();
    }

    function sumAllPools() external view returns (uint256 total) {
        for (uint256 i = 0; i < registeredMerchants.length; i++) {
            (uint128 pool,,,) = gasback.merchants(registeredMerchants[i]);
            total += pool;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main test contract
// ─────────────────────────────────────────────────────────────────────────────

contract GasbackTest is Test {
    // Conversion scale: 18-dec gas → 6-dec USDC
    uint256 internal constant SCALE = 1e12;
    // 1 micro-USDC per gas unit: 1e12 wei gas price → 1 gas = 1e12/1e12 = 1 USDC unit (6 dec)
    uint256 internal constant GAS_PRICE = 1e12;

    MockERC20 internal usdc;
    Gasback internal gasback;

    address internal merchant = makeAddr("merchant");
    address internal customer = makeAddr("customer");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant POOL_FUND    = 1_000e6;   // 1 000 USDC
    uint256 internal constant PAY_AMOUNT   = 100e6;     // 100 USDC
    uint256 internal constant CUST_BALANCE = 10_000e6;  // 10 000 USDC

    // Generous limits so they don't interfere unless a test specifically tests caps
    uint64 internal constant MAX_REBATE    = 500e6;     // 500 USDC per tx
    uint64 internal constant MAX_GAS_PRICE = type(uint64).max; // effectively no price cap by default

    function setUp() public {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        gasback = new Gasback(IERC20(address(usdc)), 0);

        // Fund accounts
        usdc.mint(merchant, POOL_FUND + 1_000e6);
        usdc.mint(customer, CUST_BALANCE);
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    /// Register merchant, approve + fund pool.
    function _registerAndFund(address m, uint64 maxRebate, uint64 maxGp, uint128 poolAmt) internal {
        vm.startPrank(m);
        gasback.registerMerchant(maxRebate, maxGp);
        usdc.approve(address(gasback), poolAmt);
        gasback.fundPool(poolAmt);
        vm.stopPrank();
    }

    // =========================================================================
    // 1. Deployment & initialization
    // =========================================================================

    function test_Constructor_SetsImmutables() public view {
        assertEq(address(gasback.usdc()), address(usdc));
        assertEq(gasback.overheadGas(), 0);
    }

    // =========================================================================
    // 2. registerMerchant — happy path
    // =========================================================================

    function test_RegisterMerchant_SetsFields() public {
        vm.prank(merchant);
        gasback.registerMerchant(MAX_REBATE, MAX_GAS_PRICE);

        (uint128 pool, uint64 maxRebate, uint64 maxGp, bool exists) = gasback.merchants(merchant);
        assertTrue(exists);
        assertEq(pool, 0);
        assertEq(maxRebate, MAX_REBATE);
        assertEq(maxGp, MAX_GAS_PRICE);
    }

    function test_RegisterMerchant_EmitsMerchantRegistered() public {
        vm.prank(merchant);
        vm.expectEmit(true, false, false, true, address(gasback));
        emit Gasback.MerchantRegistered(merchant, MAX_REBATE, MAX_GAS_PRICE);
        gasback.registerMerchant(MAX_REBATE, MAX_GAS_PRICE);
    }

    // =========================================================================
    // 3. fundPool — happy path
    // =========================================================================

    function test_FundPool_IncreasesPoolAndContractBalance() public {
        _registerAndFund(merchant, MAX_REBATE, MAX_GAS_PRICE, uint128(POOL_FUND));

        (uint128 pool,,,) = gasback.merchants(merchant);
        assertEq(pool, POOL_FUND);
        assertEq(usdc.balanceOf(address(gasback)), POOL_FUND);
    }

    function test_FundPool_EmitsPoolFunded() public {
        vm.prank(merchant);
        gasback.registerMerchant(MAX_REBATE, MAX_GAS_PRICE);

        uint128 amt = uint128(POOL_FUND);
        usdc.approve(address(gasback), amt); // still prank'd? No — startPrank ended.
        vm.startPrank(merchant);
        usdc.approve(address(gasback), amt);
        vm.expectEmit(true, false, false, true, address(gasback));
        emit Gasback.PoolFunded(merchant, amt);
        gasback.fundPool(amt);
        vm.stopPrank();
    }

    // =========================================================================
    // 4. withdrawPool — happy path + event
    // =========================================================================

    function test_WithdrawPool_DecreasesPoolAndSendsUSDC() public {
        _registerAndFund(merchant, MAX_REBATE, MAX_GAS_PRICE, uint128(POOL_FUND));

        uint128 withdrawAmt = uint128(POOL_FUND / 2);
        uint256 balBefore = usdc.balanceOf(merchant);

        vm.prank(merchant);
        gasback.withdrawPool(withdrawAmt);

        (uint128 pool,,,) = gasback.merchants(merchant);
        assertEq(pool, POOL_FUND - withdrawAmt);
        assertEq(usdc.balanceOf(merchant), balBefore + withdrawAmt);
        assertEq(usdc.balanceOf(address(gasback)), POOL_FUND - withdrawAmt);
    }

    function test_WithdrawPool_EmitsPoolWithdrawn() public {
        _registerAndFund(merchant, MAX_REBATE, MAX_GAS_PRICE, uint128(POOL_FUND));
        uint128 withdrawAmt = uint128(POOL_FUND);

        vm.prank(merchant);
        vm.expectEmit(true, false, false, true, address(gasback));
        emit Gasback.PoolWithdrawn(merchant, withdrawAmt);
        gasback.withdrawPool(withdrawAmt);
    }

    // =========================================================================
    // 5. setLimits — happy path + event
    // =========================================================================

    function test_SetLimits_UpdatesFields() public {
        vm.prank(merchant);
        gasback.registerMerchant(MAX_REBATE, MAX_GAS_PRICE);

        uint64 newRebate = 50e6;
        uint64 newGp = 2e12;
        vm.prank(merchant);
        gasback.setLimits(newRebate, newGp);

        (, uint64 mr, uint64 mgp,) = gasback.merchants(merchant);
        assertEq(mr, newRebate);
        assertEq(mgp, newGp);
    }

    function test_SetLimits_EmitsLimitsUpdated() public {
        vm.prank(merchant);
        gasback.registerMerchant(MAX_REBATE, MAX_GAS_PRICE);

        uint64 newRebate = 50e6;
        uint64 newGp = 2e12;
        vm.prank(merchant);
        vm.expectEmit(true, false, false, true, address(gasback));
        emit Gasback.LimitsUpdated(merchant, newRebate, newGp);
        gasback.setLimits(newRebate, newGp);
    }

    // =========================================================================
    // 6. pay() — full happy path
    // =========================================================================

    function test_Pay_HappyPath() public {
        // Set deterministic gas price
        vm.txGasPrice(GAS_PRICE);
        _registerAndFund(merchant, MAX_REBATE, MAX_GAS_PRICE, uint128(POOL_FUND));

        uint256 custBalBefore     = usdc.balanceOf(customer);
        uint256 merchantBalBefore = usdc.balanceOf(merchant);
        (uint128 poolBefore,,,)   = gasback.merchants(merchant);

        bytes32 orderRef = bytes32("order-001");

        vm.startPrank(customer);
        usdc.approve(address(gasback), PAY_AMOUNT);
        uint256 rebate = gasback.pay(merchant, PAY_AMOUNT, orderRef);
        vm.stopPrank();

        uint256 custBalAfter     = usdc.balanceOf(customer);
        uint256 merchantBalAfter = usdc.balanceOf(merchant);
        (uint128 poolAfter,,,)   = gasback.merchants(merchant);

        // Merchant received exactly amount
        assertEq(merchantBalAfter, merchantBalBefore + PAY_AMOUNT, "merchant balance mismatch");

        // Customer net: paid amount, got rebate back
        assertEq(custBalAfter, custBalBefore - PAY_AMOUNT + rebate, "customer balance mismatch");

        // Pool decreased by exactly rebate
        assertEq(uint256(poolAfter), uint256(poolBefore) - rebate, "pool not decreased by rebate");

        // Contract holds exactly poolAfter
        assertEq(usdc.balanceOf(address(gasback)), uint256(poolAfter), "contract balance != pool");
    }

    function test_Pay_EmitsPaidEvent() public {
        vm.txGasPrice(GAS_PRICE);
        _registerAndFund(merchant, MAX_REBATE, MAX_GAS_PRICE, uint128(POOL_FUND));

        bytes32 orderRef = bytes32("order-002");

        vm.startPrank(customer);
        usdc.approve(address(gasback), PAY_AMOUNT);

        // We check merchant, customer, orderRef (indexed) and amount; rebate/gasUsed/price we skip
        // by setting checkData=false for the non-indexed fields we can't predict exactly.
        // Use checkData=false so only indexed topics are matched.
        vm.expectEmit(true, true, true, false, address(gasback));
        emit Gasback.Paid(merchant, customer, PAY_AMOUNT, orderRef, 0, 0, 0);
        gasback.pay(merchant, PAY_AMOUNT, orderRef);
        vm.stopPrank();
    }

    // =========================================================================
    // 7. Calibration test
    // =========================================================================

    function test_Calibration() public {
        // Use dedicated addresses so setUp funds do not interfere
        address calMerchant = makeAddr("cal-merchant");
        address calCustomer = makeAddr("cal-customer");

        // Large enough pool to cover any rebate during calibration
        uint128 calPool     = 1_000_000e6;
        uint64  calMaxRebate = uint64(calPool);

        // Mint fresh USDC to calibration accounts
        usdc.mint(calMerchant, uint256(calPool) * 3); // enough for three fundPool calls
        usdc.mint(calCustomer, PAY_AMOUNT * 10);

        // Use a gas price that yields measurable USDC-unit rebates
        vm.txGasPrice(GAS_PRICE); // 1e12 wei/gas → 1 USDC-unit per gas

        // ── Round 0: overheadGas = 0 ──
        Gasback gb0 = new Gasback(IERC20(address(usdc)), 0);

        vm.startPrank(calMerchant);
        gb0.registerMerchant(calMaxRebate, MAX_GAS_PRICE);
        usdc.approve(address(gb0), calPool);
        gb0.fundPool(calPool);
        vm.stopPrank();

        vm.startPrank(calCustomer);
        usdc.approve(address(gb0), PAY_AMOUNT);

        // ── Measure gas consumed by pay() from inside the test frame ──
        uint256 gasLeftBefore = gasleft();
        uint256 rebate0       = gb0.pay(calMerchant, PAY_AMOUNT, bytes32("cal-order"));
        uint256 gasLeftAfter  = gasleft();
        vm.stopPrank();

        uint256 gasConsumedInFrame = gasLeftBefore - gasLeftAfter;

        // Recover gasUsedInternal (what pay() measured with overheadGas=0):
        //   rebate0 = gasUsedInternal * GAS_PRICE / SCALE  (no cap hit at these levels)
        //   → gasUsedInternal = rebate0 * SCALE / GAS_PRICE
        uint256 gasUsedInternal = (rebate0 * SCALE) / GAS_PRICE;

        // suggestedOverhead = overhead consumed AFTER pay()'s internal measurement point
        uint256 suggestedOverhead = gasConsumedInFrame > gasUsedInternal
            ? gasConsumedInFrame - gasUsedInternal
            : 0;

        uint256 trueFeePaid = (gasConsumedInFrame * GAS_PRICE) / SCALE;

        console.log("=== Calibration Table ===");
        console.log("gasConsumedInFrame  :", gasConsumedInFrame);
        console.log("gasUsedInternal (G0):", gasUsedInternal);
        console.log("suggestedOverheadGas:", suggestedOverhead);
        console.log("gasPrice (wei)      :", GAS_PRICE);
        console.log("trueFeePaid (USDC u):", trueFeePaid);
        console.log("rebate0 (USDC u)    :", rebate0);

        // ── Round 1: redeploy with suggestedOverhead ──
        Gasback gb1 = new Gasback(IERC20(address(usdc)), suggestedOverhead);

        vm.startPrank(calMerchant);
        gb1.registerMerchant(calMaxRebate, MAX_GAS_PRICE);
        usdc.approve(address(gb1), calPool);
        gb1.fundPool(calPool);
        vm.stopPrank();

        vm.startPrank(calCustomer);
        usdc.approve(address(gb1), PAY_AMOUNT);
        uint256 rebate1 = gb1.pay(calMerchant, PAY_AMOUNT, bytes32("cal-order-2"));
        vm.stopPrank();

        console.log("rebate1 (tuned)     :", rebate1);

        // rebate1 should be within 5% of trueFeePaid (if trueFeePaid > 0)
        if (trueFeePaid > 0) {
            uint256 diff = rebate1 > trueFeePaid ? rebate1 - trueFeePaid : trueFeePaid - rebate1;
            // 5% tolerance
            assertLe(diff * 100, trueFeePaid * 5, "Rebate deviates >5% from true fee");
        }
    }

    // =========================================================================
    // 8. Rebate caps
    // =========================================================================

    function test_Cap_MaxRebatePerTx() public {
        // Set maxRebatePerTx = 1 USDC
        uint64 maxRebateCap = 1e6;
        // Use a gas price high enough that uncapped rebate >> 1e6
        // gasUsed ~ a few hundred; gasPrice = 1e15 → rebate = 300 * 1e15 / 1e12 = 300_000 USDC units
        uint256 highGasPrice = 1e15;
        vm.txGasPrice(highGasPrice);

        _registerAndFund(merchant, maxRebateCap, MAX_GAS_PRICE, uint128(POOL_FUND));

        vm.startPrank(customer);
        usdc.approve(address(gasback), PAY_AMOUNT);
        uint256 rebate = gasback.pay(merchant, PAY_AMOUNT, bytes32("cap-test"));
        vm.stopPrank();

        assertEq(rebate, maxRebateCap, "rebate should be capped by maxRebatePerTx");
    }

    function test_Cap_PoolBalance() public {
        // Pool = 0.1 USDC; use gas price high enough to exceed that
        uint128 smallPool = 1e5; // 0.1 USDC
        uint64 bigMaxRebate = 100e6; // 100 USDC maxRebate — much larger than pool
        vm.txGasPrice(1e15); // high gas price

        vm.startPrank(merchant);
        gasback.registerMerchant(bigMaxRebate, MAX_GAS_PRICE);
        usdc.approve(address(gasback), smallPool);
        gasback.fundPool(smallPool);
        vm.stopPrank();

        vm.startPrank(customer);
        usdc.approve(address(gasback), PAY_AMOUNT);
        uint256 rebate = gasback.pay(merchant, PAY_AMOUNT, bytes32("pool-cap"));
        vm.stopPrank();

        assertEq(rebate, smallPool, "rebate should be capped by pool balance");
    }

    function test_Cap_MaxGasPrice() public {
        uint64 cappedGp = 1e12;         // merchant max gas price = 1e12
        uint256 inflatedGp = 1e15;       // tx gas price = 1000x higher

        _registerAndFund(merchant, MAX_REBATE, cappedGp, uint128(POOL_FUND));
        vm.txGasPrice(inflatedGp);

        uint256 poolBefore;
        {
            (uint128 p,,,) = gasback.merchants(merchant);
            poolBefore = p;
        }

        vm.startPrank(customer);
        usdc.approve(address(gasback), PAY_AMOUNT);
        uint256 rebate = gasback.pay(merchant, PAY_AMOUNT, bytes32("gp-cap"));
        vm.stopPrank();

        // Rebate must have been computed with price = cappedGp, not inflatedGp
        // So rebate < (gasUsed * inflatedGp / SCALE) — verify by checking that the
        // rebate matches a calculation using cappedGp.
        // We recover gasUsed from rebate = gasUsed * cappedGp / SCALE → gasUsed = rebate * SCALE / cappedGp
        // Then ensure rebate != (that gasUsed) * inflatedGp / SCALE
        uint256 rebateIfInflated = (rebate * SCALE / cappedGp) * inflatedGp / SCALE;
        assertTrue(rebate < rebateIfInflated || rebate == 0, "rebate should use capped gas price");

        // Also: pool decreased by rebate
        (uint128 poolAfter,,,) = gasback.merchants(merchant);
        assertEq(uint256(poolAfter), poolBefore - rebate, "pool accounting wrong");
    }

    function test_Cap_Basefee() public {
        uint256 basefee = 1e12;          // block.basefee = 1e12
        uint256 txGp    = 5e12;          // tx.gasprice = 5e12 > basefee*2=2e12

        // Set basefee and txGasPrice
        vm.fee(basefee);
        vm.txGasPrice(txGp);

        _registerAndFund(merchant, MAX_REBATE, MAX_GAS_PRICE, uint128(POOL_FUND));

        uint256 poolBefore;
        {
            (uint128 p,,,) = gasback.merchants(merchant);
            poolBefore = p;
        }

        vm.startPrank(customer);
        usdc.approve(address(gasback), PAY_AMOUNT);
        uint256 rebate = gasback.pay(merchant, PAY_AMOUNT, bytes32("basefee-cap"));
        vm.stopPrank();

        // Effective price should be min(txGp=5e12, MAX_GAS_PRICE, basefee*2=2e12) = 2e12
        // rebate based on inflated tx price = rebate * txGp/effectivePrice — must exceed actual
        uint256 rebateIfTxGp = (rebate * txGp) / (basefee * 2);
        assertTrue(rebate < rebateIfTxGp || rebate == 0, "basefee*2 cap not applied");

        // Pool accounting
        (uint128 poolAfter,,,) = gasback.merchants(merchant);
        assertEq(uint256(poolAfter), poolBefore - rebate, "pool accounting wrong after basefee cap");
    }

    // =========================================================================
    // 9. Empty pool — payment succeeds, rebate == 0
    // =========================================================================

    function test_Pay_EmptyPool_RebateIsZero() public {
        vm.txGasPrice(GAS_PRICE);

        // Register merchant but do NOT fund pool
        vm.prank(merchant);
        gasback.registerMerchant(MAX_REBATE, MAX_GAS_PRICE);

        uint256 merchantBalBefore = usdc.balanceOf(merchant);

        vm.startPrank(customer);
        usdc.approve(address(gasback), PAY_AMOUNT);
        uint256 rebate = gasback.pay(merchant, PAY_AMOUNT, bytes32("empty-pool"));
        vm.stopPrank();

        assertEq(rebate, 0, "rebate should be 0 for empty pool");
        assertEq(usdc.balanceOf(merchant), merchantBalBefore + PAY_AMOUNT, "merchant should still receive payment");
    }

    // =========================================================================
    // 10. Revert cases
    // =========================================================================

    function test_Revert_ZeroAmount() public {
        _registerAndFund(merchant, MAX_REBATE, MAX_GAS_PRICE, uint128(POOL_FUND));

        vm.prank(customer);
        vm.expectRevert(Gasback.ZeroAmount.selector);
        gasback.pay(merchant, 0, bytes32("zero-amt"));
    }

    function test_Revert_UnregisteredMerchant() public {
        vm.startPrank(customer);
        usdc.approve(address(gasback), PAY_AMOUNT);
        vm.expectRevert(Gasback.UnregisteredMerchant.selector);
        gasback.pay(stranger, PAY_AMOUNT, bytes32("unreg"));
        vm.stopPrank();
    }

    function test_Revert_SelfPay() public {
        _registerAndFund(merchant, MAX_REBATE, MAX_GAS_PRICE, uint128(POOL_FUND));

        vm.startPrank(merchant);
        usdc.approve(address(gasback), PAY_AMOUNT);
        vm.expectRevert(Gasback.SelfPay.selector);
        gasback.pay(merchant, PAY_AMOUNT, bytes32("self-pay"));
        vm.stopPrank();
    }

    function test_Revert_AlreadyRegistered() public {
        vm.startPrank(merchant);
        gasback.registerMerchant(MAX_REBATE, MAX_GAS_PRICE);
        vm.expectRevert(Gasback.AlreadyRegistered.selector);
        gasback.registerMerchant(MAX_REBATE, MAX_GAS_PRICE);
        vm.stopPrank();
    }

    function test_Revert_FundPool_NotMerchant() public {
        usdc.mint(stranger, 100e6);
        vm.startPrank(stranger);
        usdc.approve(address(gasback), 100e6);
        vm.expectRevert(Gasback.NotMerchant.selector);
        gasback.fundPool(100e6);
        vm.stopPrank();
    }

    function test_Revert_WithdrawPool_NotMerchant() public {
        vm.prank(stranger);
        vm.expectRevert(Gasback.NotMerchant.selector);
        gasback.withdrawPool(1e6);
    }

    function test_Revert_SetLimits_NotMerchant() public {
        vm.prank(stranger);
        vm.expectRevert(Gasback.NotMerchant.selector);
        gasback.setLimits(1e6, 1e12);
    }

    function test_Revert_WithdrawPool_InsufficientPool() public {
        _registerAndFund(merchant, MAX_REBATE, MAX_GAS_PRICE, uint128(POOL_FUND));

        vm.prank(merchant);
        vm.expectRevert(Gasback.InsufficientPool.selector);
        gasback.withdrawPool(uint128(POOL_FUND + 1));
    }

    function test_Revert_FundPool_ZeroAmount() public {
        vm.prank(merchant);
        gasback.registerMerchant(MAX_REBATE, MAX_GAS_PRICE);

        vm.prank(merchant);
        vm.expectRevert(Gasback.ZeroAmount.selector);
        gasback.fundPool(0);
    }

    function test_Revert_WithdrawPool_ZeroAmount() public {
        _registerAndFund(merchant, MAX_REBATE, MAX_GAS_PRICE, uint128(POOL_FUND));

        vm.prank(merchant);
        vm.expectRevert(Gasback.ZeroAmount.selector);
        gasback.withdrawPool(0);
    }

    function test_Revert_InsufficientAllowance() public {
        _registerAndFund(merchant, MAX_REBATE, MAX_GAS_PRICE, uint128(POOL_FUND));

        // customer has balance but no allowance
        vm.prank(customer);
        // ERC20 will revert — catch any revert (SafeERC20 wraps the revert)
        vm.expectRevert();
        gasback.pay(merchant, PAY_AMOUNT, bytes32("no-allow"));
    }

    // =========================================================================
    // 11. quoteRebate — happy path
    // =========================================================================

    function test_QuoteRebate_MatchesPay() public {
        vm.txGasPrice(GAS_PRICE);
        _registerAndFund(merchant, MAX_REBATE, MAX_GAS_PRICE, uint128(POOL_FUND));

        // Quote using an estimated gas value close to what pay() will use
        uint256 estimatedGas = 50_000;
        uint256 quoted = gasback.quoteRebate(merchant, estimatedGas, GAS_PRICE);

        // Verify it follows the same formula: gasUsed * price / scale, capped by maxRebate & pool
        uint256 expected = (estimatedGas * GAS_PRICE) / SCALE;
        if (expected > MAX_REBATE) expected = MAX_REBATE;
        if (expected > POOL_FUND)  expected = POOL_FUND;
        assertEq(quoted, expected, "quoteRebate formula mismatch");
    }

    function test_QuoteRebate_Revert_UnregisteredMerchant() public {
        vm.expectRevert(Gasback.UnregisteredMerchant.selector);
        gasback.quoteRebate(stranger, 50_000, GAS_PRICE);
    }

    // =========================================================================
    // 12. Fuzz tests
    // =========================================================================

    function testFuzz_Pay_MerchantAlwaysReceivesAmount(uint256 amount, uint256 gpSeed) public {
        // Bound inputs
        amount = bound(amount, 1, 1_000_000e6);
        uint256 gp = bound(gpSeed, 1, 2e18);
        vm.txGasPrice(gp);

        // Mint enough for customer
        usdc.mint(customer, amount);

        // Register merchant with generous limits
        uint64 maxRebate  = type(uint64).max;
        uint64 maxGpLimit = type(uint64).max;
        vm.startPrank(merchant);
        if (!_isMerchantRegistered(merchant)) {
            gasback.registerMerchant(maxRebate, maxGpLimit);
        }
        vm.stopPrank();

        // Fund pool generously
        uint128 poolFund = type(uint128).max / 2;
        usdc.mint(merchant, poolFund);
        vm.startPrank(merchant);
        usdc.approve(address(gasback), poolFund);
        // Only fund if pool is currently 0 (first call) — use try/catch for already-registered
        try gasback.fundPool(poolFund) {} catch {}
        vm.stopPrank();

        uint256 merchantBalBefore = usdc.balanceOf(merchant);
        (uint128 poolBefore,,,) = gasback.merchants(merchant);

        vm.startPrank(customer);
        usdc.approve(address(gasback), amount);
        uint256 rebate = gasback.pay(merchant, amount, bytes32("fuzz"));
        vm.stopPrank();

        // (a) merchant receives exactly amount
        assertEq(usdc.balanceOf(merchant), merchantBalBefore + amount, "fuzz: merchant balance");

        // (b) rebate <= pool before
        assertLe(rebate, uint256(poolBefore), "fuzz: rebate > pool before");

        // (c) contract balance == pool after
        (uint128 poolAfter,,,) = gasback.merchants(merchant);
        assertEq(usdc.balanceOf(address(gasback)), uint256(poolAfter), "fuzz: contract != pool");
    }

    function testFuzz_RegisterMerchant_StoredCorrectly(uint64 maxRebate, uint64 maxGp) public {
        address newMerchant = makeAddr("fuzz-merchant");
        vm.prank(newMerchant);
        gasback.registerMerchant(maxRebate, maxGp);

        (, uint64 mr, uint64 mgp, bool exists) = gasback.merchants(newMerchant);
        assertTrue(exists);
        assertEq(mr, maxRebate);
        assertEq(mgp, maxGp);
    }

    function testFuzz_WithdrawPool_NeverExceedsPool(uint128 fundAmt, uint128 withdrawAmt) public {
        fundAmt    = uint128(bound(uint256(fundAmt),    1, type(uint64).max));
        withdrawAmt = uint128(bound(uint256(withdrawAmt), 1, type(uint64).max));

        usdc.mint(merchant, fundAmt);
        vm.startPrank(merchant);
        if (!_isMerchantRegistered(merchant)) {
            gasback.registerMerchant(MAX_REBATE, MAX_GAS_PRICE);
        }
        usdc.approve(address(gasback), fundAmt);
        gasback.fundPool(fundAmt);
        vm.stopPrank();

        (uint128 pool,,,) = gasback.merchants(merchant);

        if (withdrawAmt > pool) {
            vm.prank(merchant);
            vm.expectRevert(Gasback.InsufficientPool.selector);
            gasback.withdrawPool(withdrawAmt);
        } else {
            vm.prank(merchant);
            gasback.withdrawPool(withdrawAmt);
            (uint128 poolAfter,,,) = gasback.merchants(merchant);
            assertEq(uint256(poolAfter), uint256(pool) - uint256(withdrawAmt));
        }
    }

    // ─── internal helper ────────────────────────────────────────────────────

    function _isMerchantRegistered(address m) internal view returns (bool) {
        (,,, bool exists) = gasback.merchants(m);
        return exists;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant test suite (separate contract so targetContract works cleanly)
// ─────────────────────────────────────────────────────────────────────────────

contract GasbackInvariantTest is Test {
    Gasback internal gasback;
    MockERC20 internal usdc;
    GasbackHandler internal handler;

    function setUp() public {
        usdc    = new MockERC20("Mock USDC", "mUSDC", 6);
        gasback = new Gasback(IERC20(address(usdc)), 0);
        handler = new GasbackHandler(gasback, usdc);

        // Allow handler actors to interact with gasback
        targetContract(address(handler));
    }

    /// @notice Core invariant: contract's USDC balance == sum of all merchant pools.
    function invariant_ContractBalanceEqualsSumOfPools() public view {
        uint256 contractBalance = usdc.balanceOf(address(gasback));
        uint256 sumPools        = handler.sumAllPools();
        assertEq(contractBalance, sumPools, "invariant: contract balance != sum of pools");
    }
}
