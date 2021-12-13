// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "prb-math/contracts/PRBMathUD60x18Typed.sol";
import "hardhat/console.sol";
import "../interfaces/IYOPVaultRewards.sol";
import "../vaults/roles/Governable.sol";

/// @notice This contract will be used to calculate the YOP rewards for users in real time (everytime when user deposits or withdraws from the vaults).
/// @dev Given the token emission rate for a vault R, and from time T1 to time T2, user balance U and total balance of the vault V, the rewards for the user can be calculated as:
///       (T2 - T1) * R * (U/V)
///      So to calculate the total rewards for a user, we just need to calculate the value above everytime when R, U, V is about to change, from the last time any of these value chaged,
///      and add them up over time.
///      The above equation can also be written as (T2 - T1) * R / V * U. So when U is not changed, we can calculate the sum of `(T2 - T1) * R / V` part and store it. And then multiply the U when U is about to change.
///      And this is how we do it in this contract.
contract YOPVaultRewards is IYOPVaultRewards, GovernableUpgradeable, PausableUpgradeable, UUPSUpgradeable {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
  using PRBMathUD60x18Typed for PRBMath.UD60x18;

  /// @notice Emitted when the ratio of rewards for all vaults is changed
  event VaultsRewardsRatioUpdated(uint256 _ratio);
  /// @notice Emitted when the weight points of a vault is updated
  event VaultRewardWeightUpdated(address _vault, uint256 _weight);
  /// @notice Emitted when rewards is calculated for a user
  event RewardsDistributed(address _vault, address _user, uint256 _amount);

  struct VaultRewardsState {
    // This is the `(T2 - T1) * R / V` part
    PRBMath.UD60x18 index;
    /// Last time when the state is updated
    uint256 timestamp;
    /// The last epoch count when the state is updated
    uint256 epochCount;
    /// The rate of the last epoch when the state is updated
    uint256 epochRate;
  }

  struct ClaimRecord {
    uint256 totalAvailable;
    uint256 totalClaimed;
  }

  uint256 public constant FIRST_EPOCH_EMISSION = 342554; // no decimals here. Will apply the appropriate decimals during calculation to improve precision.
  uint256 public constant DEFLATION_RATE = 100; // 1% in BPS
  uint256 public constant MAX_BPS = 10000;
  uint256 public constant SECONDS_PER_EPOCH = 2629743; // 1 month/30.44 days
  uint256 public constant MAX_EPOCH_COUNT = 120; // 120 months
  uint256 public constant WEIGHT_AMP = 1000000;
  uint256 public constant YOP_DECIMAL = 8;

  /// @notice The percentage of new YOP emissions that will be allocated to vault users, in BPS.
  uint256 public vaultsRewardsRatio; // 100% by default
  /// @notice The total weight points of all the vaults combined together
  uint256 public totalWeight;
  /// @notice The start time of the emission
  uint256 public emissionStartTime;
  /// @notice The end time of the emission
  uint256 public emissionEndTime;
  /// @notice The address of the YOP contract
  address public yopContractAddress;
  /// @notice The address of the wallet where reward tokens will be drawn from
  address public rewardsWallet;
  /// @notice The weight of new YOP emissions that each vault will get. Will be set by governance.
  /// @dev The percentage value is calculated using the vaultWeight/totalWeight.
  ///      If any one of the vault weight is changed, the percentage value is then changed for every other vault.
  mapping(address => uint256) public perVaultRewardsWeight;
  /// @dev Used to store all the vault addresses internally.
  EnumerableSetUpgradeable.AddressSet internal vaultAddresses;

  /// @notice The reward state for each vault
  mapping(address => VaultRewardsState) public vaultRewardsState;
  /// @notice The rewards state for each user in each vault
  mapping(address => mapping(address => PRBMath.UD60x18)) public userRewardsState;
  /// @notice The claimed records of reward tokens for each user
  mapping(address => ClaimRecord) public claimRecords;

  // solhint-disable-next-line no-empty-blocks
  constructor() {}

  /// @param _governance The address of the governance
  /// @param _wallet The address of the reward wallet where this contract can draw reward tokens.
  function initialize(
    address _governance,
    address _wallet,
    address _yopContract,
    uint256 _emissionStartTime
  ) external initializer {
    __YOPVaultRewards_init(_governance, _wallet, _yopContract, _emissionStartTime);
  }

  // solhint-disable-next-line func-name-mixedcase
  function __YOPVaultRewards_init(
    address _governance,
    address _wallet,
    address _yopContract,
    uint256 _emissionStartTime
  ) internal {
    __Governable_init(_governance);
    __Pausable_init_unchained();
    __YOPVaultRewards_init_unchained(_wallet, _yopContract, _emissionStartTime);
  }

  // solhint-disable-next-line func-name-mixedcase
  function __YOPVaultRewards_init_unchained(
    address _wallet,
    address _yopContract,
    uint256 _emissionStartTime
  ) internal {
    require(_wallet != address(0), "invalid wallet address");
    require(_yopContract != address(0), "invalid yop contract address");
    require(_emissionStartTime > 0, "invalid emission start time");
    rewardsWallet = _wallet;
    yopContractAddress = _yopContract;
    emissionStartTime = _emissionStartTime;
    emissionEndTime = emissionStartTime + SECONDS_PER_EPOCH * MAX_EPOCH_COUNT;
    vaultsRewardsRatio = MAX_BPS;
  }

  /// @notice Returns the current emission rate of the rewards token (per epoch/month) and the epoch count. The epoch count will start from 1.
  function rate() external view returns (uint256 _rate, uint256 _epoch) {
    if ((_getBlockTimestamp() < _getEpochStartTime()) || (_getBlockTimestamp() > _getEpochEndTime())) {
      return (0, 0);
    }
    uint256 r = FIRST_EPOCH_EMISSION * (10**YOP_DECIMAL);
    for (uint256 i = 0; i < MAX_EPOCH_COUNT; i++) {
      uint256 startTime = _getEpochStartTime() + SECONDS_PER_EPOCH * i;
      uint256 endTime = startTime + SECONDS_PER_EPOCH;
      if ((_getBlockTimestamp() >= startTime) && (_getBlockTimestamp() <= endTime)) {
        return (r, i + 1);
      }
      // use recursive function is a lot easier as comupting x^y for fix point values in Solidity is quite complicated and likely cost more gas
      r = (r * (MAX_BPS - DEFLATION_RATE)) / MAX_BPS;
    }
  }

  /// @notice Set the ratio of the whole reward emissions that will be allocated to vault users. Can only be set by governance.
  /// @param _ratio The ratio value in basis points (100 = 1%).
  function setVaultsRewardsRatio(uint256 _ratio) external {
    _onlyGovernance();
    require(_ratio <= MAX_BPS, "invalid ratio");
    if (vaultsRewardsRatio != _ratio) {
      for (uint256 i = 0; i < vaultAddresses.length(); i++) {
        // need to update the vault state with the old value before the rate is changed
        _updateVaultState(vaultAddresses.at(i));
      }
      vaultsRewardsRatio = _ratio;
      emit VaultsRewardsRatioUpdated(_ratio);
    }
  }

  /// @notice Set the weight points of each vault. The weight will be used to decide the percentages of the reward emissions that are allocated to all vaults will be distributed to each vault.
  ///         Can only be set by governance.
  /// @param _vaults The addresses of al the vaults.
  /// @param _weights The corresponding weight values of each vault. The weight values can be any value and percentage for each vault is calculated as (vaultWeight/totalWeight).
  function setPerVaultRewardsWeight(address[] calldata _vaults, uint256[] calldata _weights) external {
    _onlyGovernance();
    require(_vaults.length == _weights.length, "invalid input");
    for (uint256 i = 0; i < _vaults.length; i++) {
      address vault = _vaults[i];
      uint256 oldValue = perVaultRewardsWeight[vault];
      // need to udpate the vault state with the old value before the rate is changed
      // if any of the weight on a vault is changed, then we need to take a snapshot of all the vaults as their allocation is changed.
      _updateVaultState(vault);
      perVaultRewardsWeight[vault] = _weights[i];
      totalWeight = totalWeight - oldValue + _weights[i];
      vaultAddresses.add(vault);
      emit VaultRewardWeightUpdated(vault, _weights[i]);
    }
  }

  /// @notice Calculate rewards the given _user should receive in the given _vault. Can only be invoked by the vault.
  /// @dev This should be called everytime when a user deposits/withdraws from a vault.
  ///      It needs to be called *BEFORE* the user balance is actually updated in the vault.
  /// @param _vault The address of the vault
  /// @param _user The address of the user
  function calculateRewards(address _vault, address _user) external {
    require(vaultAddresses.contains(msg.sender), "not authorised");
    require(msg.sender == _vault, "only vault");
    _updateVaultState(_vault);
    _updateUserState(_vault, _user);
  }

  /// @notice Claim reward tokens for the caller across all the repos and send the rewards to the given address.
  /// @param _to The address to send the rewards to
  function claimAll(address _to) external whenNotPaused {
    for (uint256 i = 0; i < vaultAddresses.length(); i++) {
      _updateVaultState(vaultAddresses.at(i));
      _updateUserState(vaultAddresses.at(i), msg.sender);
    }
    _claim(msg.sender, _to);
  }

  /// @notice Claim reward tokens for the caller in the given vaults and send the rewards to the given address.
  /// @param _vaults The addresses of the vaults to claim rewards for
  /// @param _to The address to send the reward tokens
  function claim(address[] calldata _vaults, address _to) external whenNotPaused {
    require(_vaults.length > 0, "no vaults");
    for (uint256 i = 0; i < _vaults.length; i++) {
      _updateVaultState(_vaults[i]);
      _updateUserState(_vaults[i], msg.sender);
    }
    _claim(msg.sender, _to);
  }

  /// @notice Returns the total of unclaimed rewards across all the vaults for the caller.
  function allUnclaimedRewards() external view returns (uint256) {
    address[] memory vaults = vaultAddresses.values();
    return _unclaimedRewards(vaults, msg.sender);
  }

  /// @notice Returns the total of unclaimed rewards across the given vaults for the caller.
  function unclaimedRewards(address[] calldata _vaults) external view returns (uint256) {
    return _unclaimedRewards(_vaults, msg.sender);
  }

  /// @notice Set the address of the reward wallet that this contract can draw rewards from. Can only be called by governance.
  /// @param _wallet The address of the wallet that have reward tokens.
  function setRewardWallet(address _wallet) external {
    _onlyGovernance();
    rewardsWallet = _wallet;
  }

  /// @notice Pause the contract. All claim functions will be paused.
  function pause() external {
    _onlyGovernance();
    _pause();
  }

  // @notice Unpause the contract.
  function unpause() external {
    _onlyGovernance();
    _unpause();
  }

  function _updateVaultState(address _vault) internal {
    vaultRewardsState[_vault] = _calculateVaultState(_vault);
  }

  function _updateUserState(address _vault, address _user) internal {
    VaultRewardsState memory vaultState = vaultRewardsState[_vault];
    uint256 tokenDelta = _calculateUserState(_vault, _user, vaultState);
    userRewardsState[_vault][_user] = vaultState.index; // store the new value so it will be used the next time as the previous value
    claimRecords[_user].totalAvailable = claimRecords[_user].totalAvailable + tokenDelta;
    emit RewardsDistributed(_vault, _user, tokenDelta);
  }

  function _calculateVaultState(address _vault) internal view returns (VaultRewardsState memory) {
    VaultRewardsState memory vaultState = vaultRewardsState[_vault];
    if (vaultState.timestamp == 0) {
      vaultState.timestamp = _getEpochStartTime();
      // Use the vault decimal here to improve the calculation precision as this value will be devided by the totalSupply of the vault.
      // If there is a big different between the YOP decimals and the vault decimals then the calculation won't be very accurate.
      vaultState.epochRate = FIRST_EPOCH_EMISSION * (10**IERC20MetadataUpgradeable(_vault).decimals());
    }
    uint256 start = vaultState.timestamp;
    uint256 end = _getBlockTimestamp();
    if (end > start) {
      uint256 r = vaultState.epochRate;
      uint256 totalSupply = IERC20Upgradeable(_vault).totalSupply();
      if (totalSupply > 0) {
        uint256 totalAccurated;
        // Start from where last time the snapshot was taken, and loop through the epochs.
        // We the calculate the for each epoch, how many rewards the vault should get and all them up.
        // Finally we divide the value by the totalSupply of the vault.
        for (uint256 i = vaultState.epochCount; i < MAX_EPOCH_COUNT; i++) {
          uint256 epochStart = _getEpochStartTime() + SECONDS_PER_EPOCH * i;
          uint256 epochEnd = epochStart + SECONDS_PER_EPOCH;
          // Get the rate, take the vaultsRewardsRatio and the weight of the vault into account.
          uint256 currentVaultRate = (r * vaultsRewardsRatio * _weightForVault(_vault)) / MAX_BPS / WEIGHT_AMP;
          uint256 duration;
          // For each epoch, we will check if it is: the starting point, the ending point, or in between.
          // Add these to the total duration.
          if (epochStart <= start && end <= epochEnd) {
            // Inside the same epoch, so it is the starting epoch and the ending epoch.
            duration = end - start;
          } else if (epochStart <= start && start <= epochEnd && end > epochEnd) {
            // This is the starting epoch, not the ending epoch. The time included is from start to epochEnd.
            duration = epochEnd - start;
          } else if (end <= epochEnd && end >= epochStart && start < epochStart) {
            // This is the ending epoch, not the start epoch. The time included is from the epochStart to the end.
            duration = end - epochStart;
          } else {
            // Neither the starting or endoing epoch. So the whole epoch should be included.
            duration = epochEnd - epochStart;
          }
          totalAccurated += currentVaultRate * duration;
          if (end <= epochEnd || i == MAX_EPOCH_COUNT - 1) {
            // This is either the ending epoch, or the last epoch ever. Do the calcuation and store the value.
            // Solidity doesn't have support for fix-point numbers, so we use a library here to store this value.
            vaultState.index = vaultState.index.add(
              PRBMathUD60x18Typed.fromUint(totalAccurated).div(PRBMathUD60x18Typed.fromUint(SECONDS_PER_EPOCH)).div(
                PRBMathUD60x18Typed.fromUint(totalSupply)
              )
            );
            vaultState.timestamp = end;
            vaultState.epochCount = i;
            vaultState.epochRate = r;
            break;
          }
          // reduce the rate based on the deflation setting
          r = (r * (MAX_BPS - DEFLATION_RATE)) / MAX_BPS;
        }
      }
    }
    return vaultState;
  }

  function _calculateUserState(
    address _vault,
    address _user,
    VaultRewardsState memory _vaultState
  ) internal view returns (uint256) {
    uint256 vaultDecimal = IERC20MetadataUpgradeable(_vault).decimals();
    PRBMath.UD60x18 memory currentVaultIndex = _vaultState.index; // = T2 * R / V
    PRBMath.UD60x18 memory previousUserIndex = userRewardsState[_vault][_user]; // = T1 * R /V
    uint256 userBalance = IERC20Upgradeable(_vault).balanceOf(_user);
    // = U * (T2 * R / V  - T1 * R /V) = U * R / V * (T2 - T1)
    uint256 tokenDelta = PRBMathUD60x18Typed.toUint(
      PRBMathUD60x18Typed
        .fromUint(userBalance)
        .mul(currentVaultIndex.sub(previousUserIndex))
        .div(PRBMathUD60x18Typed.fromUint(10**vaultDecimal))
        .mul(PRBMathUD60x18Typed.fromUint(10**YOP_DECIMAL))
    ); // prevent phantom overflow
    return tokenDelta;
  }

  function _weightForVault(address _vault) internal view returns (uint256) {
    if (totalWeight > 0) {
      return (perVaultRewardsWeight[_vault] * WEIGHT_AMP) / totalWeight;
    }
    return 0;
  }

  function _claim(address _user, address _to) internal {
    ClaimRecord memory record = claimRecords[_user];
    uint256 claimable = record.totalAvailable - record.totalClaimed;
    require(claimable > 0, "nothing to claim");
    claimRecords[_user].totalClaimed = record.totalAvailable;
    // this requires the reward contract is approved as a spender for the wallet
    IERC20Upgradeable(_getYOPAddress()).safeTransferFrom(rewardsWallet, _to, claimable);
  }

  function _unclaimedRewards(address[] memory _vaults, address _user) internal view returns (uint256) {
    uint256 total = claimRecords[_user].totalAvailable;
    for (uint256 i = 0; i < _vaults.length; i++) {
      VaultRewardsState memory vaultState = _calculateVaultState(_vaults[i]);
      uint256 rewards = _calculateUserState(_vaults[i], _user, vaultState);
      total += rewards;
    }
    return total - claimRecords[_user].totalClaimed;
  }

  /// @dev use a function and allow override to make testing easier
  function _getEpochStartTime() internal view virtual returns (uint256) {
    return emissionStartTime;
  }

  /// @dev use a function and allow override to make testing easier
  function _getEpochEndTime() internal view virtual returns (uint256) {
    return emissionEndTime;
  }

  /// @dev use a function and allow override to make testing easier
  function _getYOPAddress() internal view virtual returns (address) {
    return yopContractAddress;
  }

  /// @dev use a function and allow override to make testing easier
  function _getBlockTimestamp() internal view virtual returns (uint256) {
    /* solhint-disable not-rely-on-time */
    return block.timestamp;
  }

  // solhint-disable-next-line no-unused-vars
  function _authorizeUpgrade(address implementation) internal view override {
    _onlyGovernance();
  }
}
