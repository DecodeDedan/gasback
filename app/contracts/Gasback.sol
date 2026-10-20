// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Gasback
/// @notice Enables merchants to refund customer gas costs in USDC within the same payment transaction.
/// @dev Gas cost conversion assumes native gas token uses 18 decimals and USDC uses token decimals read at deployment.
contract Gasback is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Merchant configuration and available rebate pool.
    /// @param pool USDC pool for rebates, in token base units.
    /// @param maxRebatePerTx Maximum rebate allowed per transaction, in token base units.
    /// @param maxGasPrice Maximum gas price accepted for rebate calculation, in wei.
    /// @param exists Whether the merchant has registered.
    struct Merchant {
        uint128 pool;
        uint64 maxRebatePerTx;
        uint64 maxGasPrice;
        bool exists;
    }

    /// @notice Emitted when a merchant registers for gas rebates.
    /// @param merchant Merchant address.
    /// @param maxRebatePerTx Maximum rebate allowed per transaction.
    /// @param maxGasPrice Maximum gas price accepted for rebate calculation.
    event MerchantRegistered(address indexed merchant, uint64 maxRebatePerTx, uint64 maxGasPrice);

    /// @notice Emitted when a merchant updates rebate limits.
    /// @param merchant Merchant address.
    /// @param maxRebatePerTx Updated maximum rebate allowed per transaction.
    /// @param maxGasPrice Updated maximum gas price accepted for rebate calculation.
    event LimitsUpdated(address indexed merchant, uint64 maxRebatePerTx, uint64 maxGasPrice);

    /// @notice Emitted when a merchant funds their rebate pool.
    /// @param merchant Merchant address.
    /// @param amount Amount funded to the pool, in USDC base units.
    event PoolFunded(address indexed merchant, uint128 amount);

    /// @notice Emitted when a merchant withdraws from their rebate pool.
    /// @param merchant Merchant address.
    /// @param amount Amount withdrawn from the pool, in USDC base units.
    event PoolWithdrawn(address indexed merchant, uint128 amount);

    /// @notice Emitted when a customer pays a merchant and receives a gas rebate.
    /// @param merchant Merchant receiving the payment.
    /// @param customer Customer paying and receiving any rebate.
    /// @param amount Payment amount sent to merchant, in USDC base units.
    /// @param orderRef Merchant order reference.
    /// @param rebate Rebate amount paid to customer, in USDC base units.
    /// @param gasUsed Gas used for rebate calculation.
    /// @param gasPrice Effective gas price used for rebate calculation.
    event Paid(
        address indexed merchant,
        address indexed customer,
        uint256 amount,
        bytes32 indexed orderRef,
        uint256 rebate,
        uint256 gasUsed,
        uint256 gasPrice
    );

    /// @notice Reverts when a merchant tries to register twice.
    error AlreadyRegistered();

    /// @notice Reverts when a caller is not a registered merchant.
    error NotMerchant();

    /// @notice Reverts when a zero amount is provided.
    error ZeroAmount();

    /// @notice Reverts when withdrawal amount exceeds merchant pool.
    error InsufficientPool();

    /// @notice Reverts when target merchant is not registered.
    error UnregisteredMerchant();

    /// @notice Reverts when a merchant attempts to pay themselves.
    error SelfPay();

    /// @notice USDC token used for payments and rebates.
    IERC20 public immutable usdc;

    /// @notice Flat gas overhead added to measured gas in `pay`.
    uint256 public immutable overheadGas;

    /// @dev USDC decimals read at deployment from the token metadata interface.
    uint8 private immutable _usdcDecimals;

    /// @notice Merchant records keyed by merchant address.
    mapping(address => Merchant) public merchants;

    /// @param usdc_ USDC token contract address.
    /// @param overheadGas_ Calibration overhead gas added during rebate calculation.
    constructor(IERC20 usdc_, uint256 overheadGas_) {
        usdc = usdc_;
        overheadGas = overheadGas_;
        _usdcDecimals = IERC20Metadata(address(usdc_)).decimals();
    }

    /// @notice Registers caller as a merchant with rebate limits.
    /// @param maxRebatePerTx Maximum rebate allowed per transaction, in USDC base units.
    /// @param maxGasPrice Maximum gas price accepted for rebate calculation, in wei.
    function registerMerchant(uint64 maxRebatePerTx, uint64 maxGasPrice) external {
        Merchant storage merchant = merchants[msg.sender];
        if (merchant.exists) revert AlreadyRegistered();

        merchant.exists = true;
        merchant.maxRebatePerTx = maxRebatePerTx;
        merchant.maxGasPrice = maxGasPrice;

        emit MerchantRegistered(msg.sender, maxRebatePerTx, maxGasPrice);
    }

    /// @notice Updates rebate limits for the caller merchant account.
    /// @param maxRebatePerTx Maximum rebate allowed per transaction, in USDC base units.
    /// @param maxGasPrice Maximum gas price accepted for rebate calculation, in wei.
    function setLimits(uint64 maxRebatePerTx, uint64 maxGasPrice) external {
        Merchant storage merchant = merchants[msg.sender];
        if (!merchant.exists) revert NotMerchant();

        merchant.maxRebatePerTx = maxRebatePerTx;
        merchant.maxGasPrice = maxGasPrice;

        emit LimitsUpdated(msg.sender, maxRebatePerTx, maxGasPrice);
    }

    /// @notice Funds caller merchant rebate pool.
    /// @param amount Amount to fund, in USDC base units.
    function fundPool(uint128 amount) external {
        Merchant storage merchant = merchants[msg.sender];
        if (!merchant.exists) revert NotMerchant();
        if (amount == 0) revert ZeroAmount();

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        merchant.pool += amount;

        emit PoolFunded(msg.sender, amount);
    }

    /// @notice Withdraws from caller merchant rebate pool.
    /// @param amount Amount to withdraw, in USDC base units.
    function withdrawPool(uint128 amount) external {
        Merchant storage merchant = merchants[msg.sender];
        if (!merchant.exists) revert NotMerchant();
        if (amount == 0) revert ZeroAmount();
        if (amount > merchant.pool) revert InsufficientPool();

        merchant.pool -= amount;
        usdc.safeTransfer(msg.sender, amount);

        emit PoolWithdrawn(msg.sender, amount);
    }

    /// @notice Executes a payment to a merchant and rebates eligible gas cost to the customer.
    /// @dev The rebate approximates the true transaction gas cost. Accuracy depends on the
    ///      `overheadGas` calibration constant set at deployment: it must account for all gas
    ///      consumed after the `gasStart` snapshot (USDC transfer, rebate math, rebate transfer,
    ///      event). Use the Foundry calibration test to measure the real value and tune
    ///      `overheadGas` so the rebate falls within ±5% of the actual tx fee. An empty merchant
    ///      pool causes the payment to succeed with rebate = 0.
    /// @param merchant Merchant receiving the payment.
    /// @param amount Payment amount to transfer to merchant, in USDC base units.
    /// @param orderRef Merchant order reference.
    /// @return rebate Rebate amount paid to the customer, in USDC base units.
    function pay(address merchant, uint256 amount, bytes32 orderRef) external nonReentrant returns (uint256 rebate) {
        uint256 gasStart = gasleft();

        if (amount == 0) revert ZeroAmount();
        Merchant storage merchantData = merchants[merchant];
        if (!merchantData.exists) revert UnregisteredMerchant();
        if (merchant == msg.sender) revert SelfPay();

        usdc.safeTransferFrom(msg.sender, merchant, amount);

        uint256 gasUsed = gasStart - gasleft() + overheadGas;
        uint256 price = tx.gasprice;

        if (price > merchantData.maxGasPrice) {
            price = merchantData.maxGasPrice;
        }

        if (block.basefee != 0) {
            uint256 basefeeCap = block.basefee * 2;
            if (price > basefeeCap) {
                price = basefeeCap;
            }
        }

        uint256 scale = 10 ** (18 - uint256(_usdcDecimals));
        rebate = (gasUsed * price) / scale;

        if (rebate > merchantData.maxRebatePerTx) {
            rebate = merchantData.maxRebatePerTx;
        }

        uint256 pool = merchantData.pool;
        if (rebate > pool) {
            rebate = pool;
        }

        merchantData.pool -= uint128(rebate);

        if (rebate > 0) {
            usdc.safeTransfer(msg.sender, rebate);
        }

        emit Paid(merchant, msg.sender, amount, orderRef, rebate, gasUsed, price);
    }

    /// @notice Quotes rebate amount for a hypothetical payment.
    /// @param merchant Merchant address.
    /// @param estGas Estimated gas usage.
    /// @param gasPrice Proposed gas price in wei.
    /// @return rebate Estimated rebate amount, in USDC base units.
    function quoteRebate(address merchant, uint256 estGas, uint256 gasPrice) external view returns (uint256 rebate) {
        Merchant storage merchantData = merchants[merchant];
        if (!merchantData.exists) revert UnregisteredMerchant();

        uint256 price = gasPrice;
        if (price > merchantData.maxGasPrice) {
            price = merchantData.maxGasPrice;
        }

        if (block.basefee != 0) {
            uint256 basefeeCap = block.basefee * 2;
            if (price > basefeeCap) {
                price = basefeeCap;
            }
        }

        uint256 scale = 10 ** (18 - uint256(_usdcDecimals));
        rebate = (estGas * price) / scale;

        if (rebate > merchantData.maxRebatePerTx) {
            rebate = merchantData.maxRebatePerTx;
        }

        uint256 pool = merchantData.pool;
        if (rebate > pool) {
            rebate = pool;
        }
    }
}
