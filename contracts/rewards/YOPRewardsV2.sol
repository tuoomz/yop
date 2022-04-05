// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "./YOPRewards.sol";

/// @dev This version of the reward contract will calculate the user's vault rewards using their boosted vault balances (taking staking into account)
///  rather than just their vault balances.
contract YOPRewardsV2 is IYOPRewardsV2, YOPRewards {
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
  using ConvertUtils for *;

  modifier onlyStaking() {
    require(stakingContract != address(0) && _msgSender() == stakingContract, "staking only");
    _;
  }

  // solhint-disable-next-line no-empty-blocks
  constructor() {}

  function initialize(
    address _governance,
    address _gatekeeper,
    address _wallet,
    address _yopContract,
    uint256 _emissionStartTime
  ) external virtual override initializer {
    __YOPRewardsV2_init(_governance, _gatekeeper, _wallet, _yopContract, _emissionStartTime);
  }

  function __YOPRewardsV2_init(
    address _governance,
    address _gatekeeper,
    address _wallet,
    address _yopContract,
    uint256 _emissionStartTime
  ) internal onlyInitializing {
    __YOPRewards_init(_governance, _gatekeeper, _wallet, _yopContract, _emissionStartTime);
  }

  /// @notice Called by the staking contract to claim rewards for a stake id when it is burnt (unstaked). The claimed rewards will be transferred to the staking contract which will then transfer to the user. Can only be called by the staking contract.
  /// @return The amount of rewards
  function claimRewardsForStakes(uint256[] calldata _stakeIds)
    external
    whenNotPaused
    nonReentrant
    onlyStaking
    returns (uint256)
  {
    _updateStateForStaking(_stakeIds);
    bytes32[] memory accounts = ConvertUtils.uint256ArrayToBytes32Array(_stakeIds);
    uint256 amount = _claim(accounts, stakingContract);
    return amount;
  }

  function _getVaultTotalSupply(address _vault) internal view virtual override returns (uint256) {
    return IBoostedVault(_vault).totalBoostedSupply();
  }

  function _getVaultBalanceOf(address _vault, address _user) internal view virtual override returns (uint256) {
    return IBoostedVault(_vault).boostedBalanceOf(_user);
  }

  /// @dev This is called when user claims their rewards for vaults. This will also update the user's boosted balance based on their latest staking position.
  function _updateStateForVaults(address[] memory _vaults, bytes32 _account) internal virtual override {
    for (uint256 i = 0; i < _vaults.length; i++) {
      require(vaultAddresses.contains(_vaults[i]), "!vault");
      // since this function is only called when claiming, if the account doesn't have any balance in a vault
      // then there is no need to update the checkpoint for the user as it will always be 0
      if (IVault(_vaults[i]).balanceOf(_account.bytes32ToAddress()) > 0) {
        address[] memory users = new address[](1);
        users[0] = _account.bytes32ToAddress();
        // the updateBoostedBalancesForUsers will calculate the user's rewards, and update the boosted balance
        // based the user's current staking position
        IBoostedVault(_vaults[i]).updateBoostedBalancesForUsers(users);
      }
    }
  }
}
