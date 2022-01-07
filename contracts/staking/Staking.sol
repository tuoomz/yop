// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../vaults/roles/Governable.sol";

/// @notice This contract will stake (lock) YOP tokens for a period of time. While the tokens are locked in this contract, users will be able to claim additional YOP tokens (from the community emission as per YOP tokenomics).
///  Users can stake as many times as they want, but each stake can't be modified/extended once it is created.
///  For each stake, the user will recive an ERC1155 NFT token as the receipt. These NFT tokens can be transferred to other to still allow users to use the locked YOP tokens as a collateral.
///  When the NFT tokens are transferred, all the remaining unclaimed rewards will be transferred to the new owner as well.
contract Staking is ERC1155, Governable {
  using SafeERC20 for IERC20;

  event Staked(
    address indexed _user,
    uint256 indexed _tokenId,
    uint248 indexed _amount,
    uint8 _lockPeriod,
    uint256 _startTime
  );
  event Unstaked(
    address indexed _user,
    uint256 indexed _tokenId,
    uint248 indexed _amount,
    uint8 _lockPeriod,
    uint256 _startTime
  );

  /// @dev represent each stake
  struct Stake {
    // the duration of the stake, in number of months
    uint8 lockPeriod;
    // amount of YOP tokens to stake
    uint248 amount;
    // when the stake is started
    uint256 startTime;
    // when the last time the NFT is transferred. This is useful to help us track how long an account has hold the token
    uint256 lastTransferTime;
  }

  uint8 public constant MAX_LOCK_PERIOD = 60;
  uint256 public constant SECONDS_PER_MONTH = 2629743; // 1 month/30.44 days
  address public constant YOP_ADDRESS = 0xAE1eaAE3F627AAca434127644371b67B18444051;
  // the minimum amount for staking
  uint256 public minStakeAmount;
  // the total supply of "working balance". The "working balance" of each stake is calculated as amount * lockPeriod.
  uint256 public totalWorkingSupply;
  // all the stake positions
  Stake[] public stakes;
  // stakes for each account
  mapping(address => uint256[]) internal stakesForAddress;
  // the total working balance for each account
  mapping(address => uint256) internal workingBalances;
  // ownership of the NFTs
  mapping(uint256 => address) public owners;

  /// @param _governance The address of governance.
  /// @param _url The base url for the metadata file
  constructor(address _governance, string memory _url) ERC1155(_url) Governable(_governance) {}

  /// @notice Set the minimum amount of tokens for staking
  /// @param _minAmount The minimum amount of tokens
  function setMinStakeAmount(uint256 _minAmount) external onlyGovernance {
    minStakeAmount = _minAmount;
  }

  /// @notice Create a new staking position
  /// @param _amount The amount of YOP tokens to stake
  /// @param _lockPeriod The locking period of the stake, in months
  /// @return The id of the NFT token
  function stake(uint248 _amount, uint8 _lockPeriod) external returns (uint256) {
    require(_amount >= minStakeAmount, "!amount");
    require(_lockPeriod > 0 && _lockPeriod <= MAX_LOCK_PERIOD, "!lockPeriod");
    require(IERC20(_getYOPAddress()).balanceOf(_msgSender()) >= _amount, "!balance");
    // issue token id
    uint256 tokenId = stakes.length;
    // record the stake
    Stake memory s = Stake({
      lockPeriod: _lockPeriod,
      amount: _amount,
      startTime: _getBlockTimestamp(),
      lastTransferTime: _getBlockTimestamp()
    });
    stakes.push(s);
    // transfer the the tokens to this contract and mint an NFT token
    IERC20(_getYOPAddress()).safeTransferFrom(_msgSender(), address(this), _amount);
    bytes memory data;
    _mint(_msgSender(), tokenId, 1, data);
    emit Staked(_msgSender(), tokenId, _amount, _lockPeriod, _getBlockTimestamp());
    return tokenId;
  }

  /// @notice Unstake a single staking position after it's expired
  /// @param _stakeId The id of the staking NFT token
  function unstakeSingle(uint256 _stakeId) external {
    Stake storage s = stakes[_stakeId];
    require(balanceOf(_msgSender(), _stakeId) > 0, "!stake");
    require(_getBlockTimestamp() > (s.startTime + s.lockPeriod * SECONDS_PER_MONTH), "!expired");
    // burn the NFT
    _burn(_msgSender(), _stakeId, 1);
    // transfer the tokens back to the user
    IERC20(_getYOPAddress()).safeTransfer(_msgSender(), s.amount);
    emit Unstaked(_msgSender(), _stakeId, s.amount, s.lockPeriod, s.startTime);
    // reset the stake instance
    s.startTime = 0;
    s.amount = 0;
    s.lockPeriod = 0;
    s.lastTransferTime = 0;
  }

  /// @notice Lists the is of stakes for a user
  /// @param _user The user address
  /// @return the ids of stakes
  function stakesFor(address _user) external view returns (uint256[] memory) {
    return stakesForAddress[_user];
  }

  /// @notice Check the working balance of an account. Use this and `totalWorkingSupply` to calculate the proportion of a user's stake
  /// @param _user The user address
  /// @return The value of working balance
  function workingBalanceOf(address _user) external view returns (uint256) {
    return workingBalances[_user];
  }

  /// @dev This function is invoked by the ERC1155 implementation. It will be called everytime when tokens are minted, transferred and burned.
  ///  We add implementation for this function to perform the common bookkeeping tasks, like update the working balance, update ownership mapping etc.
  function _beforeTokenTransfer(
    address _operator,
    address _from,
    address _to,
    uint256[] memory _ids,
    uint256[] memory _amounts,
    bytes memory _data
  ) internal override {
    uint256 tokenId = _ids[0];
    Stake storage s = stakes[tokenId];
    s.lastTransferTime = _getBlockTimestamp();
    uint256 balance = s.amount * s.lockPeriod;
    if (_from != address(0)) {
      workingBalances[_from] -= balance;
      totalWorkingSupply -= balance;
      _removeValue(stakesForAddress[_from], tokenId);
      owners[tokenId] = address(0);
    }
    if (_to != address(0)) {
      workingBalances[_to] += balance;
      totalWorkingSupply += balance;
      stakesForAddress[_to].push(tokenId);
      owners[tokenId] = _to;
    }
  }

  /// @dev For testing
  function _getBlockTimestamp() internal view virtual returns (uint256) {
    return block.timestamp;
  }

  /// @dev For testing
  function _getYOPAddress() internal view virtual returns (address) {
    return YOP_ADDRESS;
  }

  function _removeValue(uint256[] storage _values, uint256 _val) internal {
    uint256 i;
    for (i = 0; i < _values.length; i++) {
      if (_values[i] == _val) {
        break;
      }
    }
    for (; i < _values.length - 1; i++) {
      _values[i] = _values[i + 1];
    }
    _values.pop();
  }
}
