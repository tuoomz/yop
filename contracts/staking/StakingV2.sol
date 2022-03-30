// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol";
import "./Staking.sol";
import "../interfaces/IVault.sol";
import "hardhat/console.sol";

/// @dev Add a new stake function that will update the user's boost balance in selected vaults immediately after staking
contract StakingV2 is Staking {
  using ERC165CheckerUpgradeable for address;

  // solhint-disable-next-line no-empty-blocks
  constructor() {}

  function initialize(
    string memory _name,
    string memory _symbol,
    address _governance,
    address _gatekeeper,
    address _yopRewards,
    string memory _uri,
    string memory _contractURI,
    address _owner,
    address _accessControlManager
  ) external virtual override initializer {
    __StakingV2_init(
      _name,
      _symbol,
      _governance,
      _gatekeeper,
      _yopRewards,
      _uri,
      _contractURI,
      _owner,
      _accessControlManager
    );
  }

  function __StakingV2_init(
    string memory _name,
    string memory _symbol,
    address _governance,
    address _gatekeeper,
    address _yopRewards,
    string memory _uri,
    string memory _contractURI,
    address _owner,
    address _accessControlManager
  ) internal onlyInitializing {
    __Staking_init(
      _name,
      _symbol,
      _governance,
      _gatekeeper,
      _yopRewards,
      _uri,
      _contractURI,
      _owner,
      _accessControlManager
    );
  }

  /// @notice Return the total number of stakes created so far
  function totalSupply() external view returns (uint256) {
    return stakes.length;
  }

  /// @notice Same as `stake(uint248,uint8)`, but will take an array of vault addresses as extra parameter.
  ///  If the vault addresses are provided, the user's boosted balance in these vaults will be updated immediately after staking to take into account their latest staking positions.
  /// @param _amount The amount of YOP tokens to stake
  /// @param _lockPeriod The locking period of the stake, in months
  /// @param _vaultsToBoost The vaults that the user's boosted balance should be updated after staking
  /// @return The id of the NFT token that is also the id of the stake
  function stakeAndBoost(
    uint248 _amount,
    uint8 _lockPeriod,
    address[] calldata _vaultsToBoost
  ) external whenNotPaused nonReentrant returns (uint256) {
    uint256 tokenId = _mintStake(_amount, _lockPeriod);
    _updateVaults(_vaultsToBoost);
    return tokenId;
  }

  function unstakeSingleAndBoost(
    uint256 _stakeId,
    address _to,
    address[] calldata _vaultsToBoost
  ) external whenNotPaused nonReentrant {
    _burnSingle(_stakeId, _to);
    _updateVaults(_vaultsToBoost);
  }

  function unstakeAllAndBoost(address _to, address[] calldata _vaultsToBoost) external whenNotPaused nonReentrant {
    _burnAll(_to);
    _updateVaults(_vaultsToBoost);
  }

  function _updateVaults(address[] calldata _vaultsToBoost) internal {
    for (uint256 i = 0; i < _vaultsToBoost.length; i++) {
      require(_vaultsToBoost[i].supportsInterface(type(IVault).interfaceId), "!vault interface");
      if (IVault(_vaultsToBoost[i]).balanceOf(_msgSender()) > 0) {
        address[] memory users = new address[](1);
        users[0] = _msgSender();
        IBoostedVault(_vaultsToBoost[i]).updateBoostedBalancesForUsers(users);
      }
    }
  }
}
