// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router01.sol";
import "../security/BaseUpgradeable.sol";
import "../libraries/SwapUtils.sol";
import "../interfaces/IStaking.sol";
import "../interfaces/IYOPRegistry.sol";
import "../interfaces/IVault.sol";
import "../interfaces/IWeth.sol";

/// @notice This contract allow users to use any tokens against the YOP platform.
///  The contract will swap the tokens from users using Uniswap and then deposit the tokens to vaults or staking.
///  The returned receipt tokens will be forwarded to the user.
contract YOPRouter is BaseUpgradeable {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  address public stakingContract;
  address public uniswapAddress;
  address public yopAddress;
  address public wethAddress;
  address public yopRegistry;

  modifier ensureToken(address _token) {
    require(_token != address(0), "!token");
    _;
  }

  modifier ensureAmount(uint256 _amount) {
    require(_amount > 0, "!amount");
    _;
  }

  modifier ensureLockPeriod(uint8 _lockPeriod) {
    require(_lockPeriod >= 1 && _lockPeriod <= 60, "!lockPeriod");
    _;
  }

  modifier ensureDeadline(uint256 _deadline) {
    require(_deadline >= _getBlockTimestamp(), "expired");
    _;
  }

  modifier ensureETH() {
    require(msg.value > 0, "!eth");
    _;
  }

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize(
    address _governance,
    address _stakingContract,
    address _uniswapAddress,
    address _yopRegistry,
    address _yopAddress,
    address _wethAddress
  ) external initializer {
    __YOPRouter_init(_governance, _stakingContract, _uniswapAddress, _yopRegistry, _yopAddress, _wethAddress);
  }

  function __YOPRouter_init(
    address _governance,
    address _stakingContract,
    address _uniswapAddress,
    address _yopRegistry,
    address _yopAddress,
    address _wethAddress
  ) internal onlyInitializing {
    __BaseUpgradeable_init(_governance);
    __YOPRouter_init_unchained(_stakingContract, _uniswapAddress, _yopRegistry, _yopAddress, _wethAddress);
  }

  function __YOPRouter_init_unchained(
    address _stakingContract,
    address _uniswapAddress,
    address _yopRegistry,
    address _yopAddress,
    address _wethAddress
  ) internal onlyInitializing {
    stakingContract = _stakingContract;
    uniswapAddress = _uniswapAddress;
    yopRegistry = _yopRegistry;
    yopAddress = _yopAddress;
    wethAddress = _wethAddress;
  }

  /// @notice Get a quote of swapping from one token to another using Uniswap. If one of the token is ETH, use the address of WETH instead.
  /// @param _tokenIn The address of the token to be swapped from
  /// @param _amountIn The amount of the token to be swapped
  /// @param _tokenOut The address of the token to be swapped to
  /// @return The amount of YOP tokens
  function previewSwap(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut
  ) external view ensureToken(_tokenIn) ensureToken(_tokenOut) ensureAmount(_amountIn) returns (uint256) {
    if (_tokenIn == _tokenOut) {
      return _amountIn;
    }
    return SwapUtils.getAmountsOut(uniswapAddress, wethAddress, _tokenIn, _amountIn, _tokenOut);
  }

  /// @notice Swap the input token to YOP and stake the YOP tokens on behave of the calling user.
  /// @dev User may need to approve the contract at most twice: one for tokenIn (if `_tokenInAmount` is greater than 0) and one for YOP (if `_existingYOPAmount` is greater than 0).
  /// @param _tokenIn The address of the input token
  /// @param _tokenInAmount The amount of input token. This can be 0 but the total of this and `_existingYOPAmount` should be greater than 0.
  /// @param _minYOPAmount The minimum amount of YOP tokens from the swap. The transaction will fail if it's lower than this amount.
  /// @param _existingYOPAmount The amount of additional YOP tokens that will be added to the stake. User should have this amount of YOP tokens already. It can be 0, but total of this and `_tokenInAmount` should be greater than 0.
  /// @param _lockPeriod The lock up period of the stake. Should be between 1 and 60.
  /// @param _deadline A future dealine (in unix epoch seconds) that the swap is allowed to be executed.
  /// @param _vaultsToUpdate If set, the user's boosted balanced will be updated in these vaults.
  /// @return _tokenId the id of the staking NFT
  function swapAndStakeERC20(
    address _tokenIn,
    uint256 _tokenInAmount,
    uint256 _minYOPAmount,
    uint256 _existingYOPAmount,
    uint8 _lockPeriod,
    uint256 _deadline,
    address[] calldata _vaultsToUpdate
  ) external ensureToken(_tokenIn) ensureLockPeriod(_lockPeriod) ensureDeadline(_deadline) returns (uint256 _tokenId) {
    // didn't use the modifier here as getting a "stack too deep" error from the compiler
    require(_tokenInAmount + _existingYOPAmount > 0, "!amount");
    if (_existingYOPAmount > 0) {
      // user has some of YOP tokens already and want to use these for staking
      // transfer these to the contract first
      IERC20Upgradeable(yopAddress).safeTransferFrom(_msgSender(), address(this), _existingYOPAmount);
    }
    uint256 swappedAmountOut;
    if (_tokenInAmount > 0) {
      // the remaining balance will be provided by another ERC20 token
      // need to swap these tokens to YOP
      uint256[] memory amounts = _transferAndSwapERC20(_tokenIn, _tokenInAmount, yopAddress, _minYOPAmount, _deadline);
      swappedAmountOut = amounts[amounts.length - 1];
    }
    _approveStakingForYOP();
    _tokenId = IStakingV2(stakingContract).stakeAndBoostForUser(
      uint248(swappedAmountOut + _existingYOPAmount),
      _lockPeriod,
      _msgSender(),
      _vaultsToUpdate
    );
  }

  /// @notice Swap the ETH to YOP and stake the YOP tokens on behave of the calling user.
  /// @dev If `_existingYOPAmount` is greater than 0, user will need to approve the contract for transferring YOP.
  /// @param _minYOPAmount The minimum amount of YOP tokens from the swap. The transaction will fail if it's lower than this amount.
  /// @param _existingYOPAmount The amount of additional YOP tokens that will be added to the stake. User should have this amount of YOP tokens already. This can be 0.
  /// @param _lockPeriod The lock up period of the stake. Should be between 1 and 60.
  /// @param _deadline A future dealine (in unix epoch seconds) that the swap is allowed to be executed.
  /// @param _vaultsToUpdate If set, the user's boosted balanced will be updated in these vaults.
  /// @return _tokenId the id of the staking NFT
  function swapAndStakeETH(
    uint256 _minYOPAmount,
    uint256 _existingYOPAmount,
    uint8 _lockPeriod,
    uint256 _deadline,
    address[] calldata _vaultsToUpdate
  ) external payable ensureETH ensureLockPeriod(_lockPeriod) ensureDeadline(_deadline) returns (uint256 _tokenId) {
    if (_existingYOPAmount > 0) {
      // user has some of YOP tokens already and want to use these for staking
      // transfer these to the contract first
      IERC20Upgradeable(yopAddress).safeTransferFrom(_msgSender(), address(this), _existingYOPAmount);
    }
    uint256[] memory amounts = _transferAndSwapETH(yopAddress, _minYOPAmount, _deadline);
    uint256 swappedAmountOut = amounts[amounts.length - 1];
    uint256 stakingAmount = swappedAmountOut + _existingYOPAmount;
    _approveStakingForYOP();
    _tokenId = IStakingV2(stakingContract).stakeAndBoostForUser(
      uint248(stakingAmount),
      _lockPeriod,
      _msgSender(),
      _vaultsToUpdate
    );
  }

  /// @notice Swap the input token to the output token, and then deposit the output tokens to the vault that uses the output token, on behave of the calling user.
  /// @dev User may need to approve the contract at most twice: one for tokenIn (if `_amountIn` is greater than 0) and one for tokenOut (if `_existingTokenOutAmount` is greater than 0).
  /// @param _tokenIn The address of the input token.
  /// @param _amountIn The amount of input token. This can be 0 but the total of this and `_existingTokenOutAmount` should be greater than 0.
  /// @param _tokenOut The address of the output token.
  /// @param _minOutAmount The minimum amount of output tokens from the swap. The transaction will fail if it's lower than this amount.
  /// @param _existingTokenOutAmount The amount of additional output tokens that will be added to the deposit. User should have this amount of output tokens already. It can be 0, but total of this and `_amountIn` should be greater than 0.
  /// @param _deadline A future dealine (in unix epoch seconds) that the swap is allowed to be executed.
  function swapAndDepositERC20(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    uint256 _minOutAmount,
    uint256 _existingTokenOutAmount,
    uint256 _deadline
  )
    external
    ensureToken(_tokenIn)
    ensureToken(_tokenOut)
    ensureAmount(_amountIn + _existingTokenOutAmount)
    ensureDeadline(_deadline)
  {
    address vaultAddress = IYOPRegistry(yopRegistry).currentVault(_tokenOut);
    require(vaultAddress != address(0), "!vault");
    if (_existingTokenOutAmount > 0) {
      IERC20Upgradeable(_tokenOut).safeTransferFrom(_msgSender(), address(this), _existingTokenOutAmount);
    }
    uint256 swappedAmountOut;
    if (_amountIn > 0) {
      uint256[] memory amounts = _transferAndSwapERC20(_tokenIn, _amountIn, _tokenOut, _minOutAmount, _deadline);
      swappedAmountOut = amounts[amounts.length - 1];
    }
    _approveVaultForDeposit(_tokenOut, vaultAddress);
    IVault(vaultAddress).deposit(_existingTokenOutAmount + swappedAmountOut, _msgSender());
  }

  /// @notice Swap ETH to the output token, and then deposit the output tokens to the vault that uses the output token, on behave of the calling user.
  /// @dev If `_existingTokenOutAmount` is greater than 0, user will need to approve the contract for transferring `_tokenOut`.
  /// @param _tokenOut The address of the output token.
  /// @param _minOutAmount The minimum amount of output tokens from the swap. The transaction will fail if it's lower than this amount.
  /// @param _existingTokenOutAmount The amount of additional output tokens that will be added to the deposit. User should have this amount of output tokens already. It can be 0, but total of this and `_amountIn` should be greater than 0.
  /// @param _deadline A future dealine (in unix epoch seconds) that the swap is allowed to be executed.
  function swapAndDepositETH(
    address _tokenOut,
    uint256 _minOutAmount,
    uint256 _existingTokenOutAmount,
    uint256 _deadline
  ) external payable ensureETH ensureToken(_tokenOut) ensureDeadline(_deadline) {
    address vaultAddress = IYOPRegistry(yopRegistry).currentVault(_tokenOut);
    require(vaultAddress != address(0), "!vault");
    if (_existingTokenOutAmount > 0) {
      IERC20Upgradeable(_tokenOut).safeTransferFrom(_msgSender(), address(this), _existingTokenOutAmount);
    }
    uint256[] memory amounts = _transferAndSwapETH(_tokenOut, _minOutAmount, _deadline);
    uint256 swappedAmountOut = amounts[amounts.length - 1];
    uint256 depositAmount = _existingTokenOutAmount + swappedAmountOut;
    _approveVaultForDeposit(_tokenOut, vaultAddress);
    IVault(vaultAddress).deposit(depositAmount, _msgSender());
  }

  /// @dev This is needed in order to receive eth that will be returned by WETH contract
  // solhint-disable-next-line
  receive() external payable {}

  function _getBlockTimestamp() internal returns (uint256) {
    return block.timestamp;
  }

  function _approveUniswapForToken(address _token) internal {
    if (IERC20Upgradeable(_token).allowance(address(this), uniswapAddress) == 0) {
      IERC20Upgradeable(_token).safeApprove(uniswapAddress, type(uint256).max);
    }
  }

  function _approveStakingForYOP() internal {
    if (IERC20Upgradeable(yopAddress).allowance(address(this), stakingContract) == 0) {
      IERC20Upgradeable(yopAddress).safeApprove(stakingContract, type(uint256).max);
    }
  }

  function _approveVaultForDeposit(address _token, address _vault) internal {
    if (IERC20Upgradeable(_token).allowance(address(this), _vault) == 0) {
      IERC20Upgradeable(_token).safeApprove(_vault, type(uint256).max);
    }
  }

  function _transferAndSwapERC20(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    uint256 _minOutAmount,
    uint256 _deadline
  ) internal returns (uint256[] memory) {
    IERC20Upgradeable(_tokenIn).safeTransferFrom(_msgSender(), address(this), _amountIn);
    if (_tokenIn == _tokenOut) {
      // same token, no need to swap
      uint256[] memory amounts = new uint256[](1);
      amounts[0] = _amountIn;
      return amounts;
    } else {
      _approveUniswapForToken(_tokenIn);
      address[] memory path = SwapUtils.getSwapPath(uniswapAddress, wethAddress, _tokenIn, _tokenOut);
      uint256[] memory amounts = IUniswapV2Router01(uniswapAddress).swapExactTokensForTokens(
        _amountIn,
        _minOutAmount,
        path,
        address(this),
        _deadline
      );
      return amounts;
    }
  }

  function _transferAndSwapETH(
    address _tokenOut,
    uint256 _minOutAmount,
    uint256 _deadline
  ) internal returns (uint256[] memory) {
    if (_tokenOut == wethAddress) {
      // output token is WETH, just wrap ETH as WETH
      IWETH(wethAddress).deposit{value: msg.value}();
      uint256[] memory amounts = new uint256[](1);
      amounts[0] = msg.value;
      return amounts;
    } else {
      address[] memory path = SwapUtils.getSwapPath(uniswapAddress, wethAddress, wethAddress, _tokenOut);
      uint256[] memory amounts = IUniswapV2Router01(uniswapAddress).swapExactETHForTokens{value: msg.value}(
        _minOutAmount,
        path,
        address(this),
        _deadline
      );
      return amounts;
    }
  }
}
