# Smart Contract Changes To Support Boosted APY

## Author: Wei Li

## Problem Statement

At the moment, when users deposit to vaults, they will all receive YOP tokens as additional rewards. However, at the moment, all users are treated the same regardless they stake YOP tokens or not. This doesn't help to drive the adoption of YOP tokens, as there is no incentive for users to use the YOP tokens to get the rewards.

We want to change this behavior by introducing the "boosted APY" feature going forward - users who own & staked their YOP tokens will get increased (boosted) rewards, while users who don't stake will get reduced rewards. This will help to drive the adoption of YOP tokens when users using the YOP platform.

## Proposed Solution

### Boost Calculation

The boost is achieved by transforming the user's vault balance using a mathematical formula that will take into account the user's staking balance.

The formula is:

```
boostedVaultBalance = min(0.1 * userVaultBalance + 0.9 * userStakeBalance/totalStakeSize * totalVaultBalance, userVaultBalance)
```

This will calculate the boosted vault balance for each user. Then the user's share of the rewards will be calculated as (there are a total of `t` users in the vault):

```
userRewardsShare(i) = userBoostedVaultBalance(i)/(userBoostedVaultBalance(0) + userBoostedVaultBalance(1) + ... + userBoostedVaultBalance(i) + ... + userBoostedVaultBalance(t))
```

For example, given the following conditions:

| User Id | Vault Balance | Stake Balance |
| ------- | ------------- | ------------- |
| 1       | 100           | 10000         |
| 2       | 1000          | 1000          |
| 3       | 500           | 5000          |
| 4       | 2000          | 0             |

totalVaultBalance = 100 + 1000 + 500 + 2000 = 3600

totalStakeSize = 10000 + 1000 + 5000 + 0 = 16000

At the moment, without using the boost formula, the reward share for each user can be calculated as:

```
rewardShareUser1 = 100 / 3600 ~= 0.0278
rewardShareUser2 = 1000 / 3600 ~= 0.2778
rewardShareUser3 = 500 / 3600 ~= 0.1389
rewardShareUser4 = 2000 / 3600 ~= 0.5556
```

As shown by the calculation, user 4 doesn't stake any YOP tokens but he/she will take more than half of the total rewards for this vault.

With the boosted formula, the boosted vault balance for each user will be calculated as:

```
boostedVaultBalanceUser1 = min(0.1 * 100 + 0.9 * 10000/16000 * 3600, 100) = 100
boostedVaultBalanceUser2 = min(0.1 * 1000 + 0.9 * 1000/16000 * 3600, 1000) = 302.5
boostedVaultBalanceUser3 = min(0.1 * 500 + 0.9 * 5000/16000 * 3600, 500) = 500
boostedVaultBalanceUser4 = min(0.1 * 2000 + 0.9 * 0 / 16000 * 3600, 2000) = 200
```

and the boost for each user is:

```
boostForUser1 = 100/0.1*100 = 10
boostForUser2 = 302.5/0.1*1000 = 3.02
boostForUser3 = 500/0.1*500 = 10
boostForUser4 = 200 / 0.1*2000 = 1
```

As you can see, all users who have staked will have their balance boosted, and users who don't stake will not get any boost at all.

The new total of boosted vault balance is `100 + 302.5 + 500 + 200 = 1102.5`.

So the new reward share for each user will be:

```
boostedRewardShareUser1 = 100 / 1102.5 ~= 0.0907
boostedRewardShareUser2 = 302.5 / 1102.5 ~= 0.2744
boostedRewardShareUser3 = 500 / 1102.5 ~= 0.4535
boostedRewardShareUser4 = 200 / 1102.5 ~= 0.1814
```

Compared the to reward share calculated without the boost formula, all users who have staked will get more rewards, and users who don't stake will get significantly less rewards. This will incentivize users to buy YOP tokens and stake them, to get the boosted reward share (and higher APY).

### Calculating the Boost Value

Use the formula described in the previous section, the boost value is calculated as:

```
boost = userBoostedVaultBalance / 0.1 * userVaultBalance
```

With this, we can deduct the following equation:

```
boost = (0.1 * userVaultBalance + 0.9 * userStakeBalance/totalStakeSize * totalVaultBalance) / 0.1 * userVaultBalance
=> boost * (0.1 * userVaultBalance) = 0.1 * userVaultBalance + 0.9 * userStakeBalance/totalStakeSize * totalVaultBalance
=> boost * (0.1 * userVaultBalance) - 0.1 * userVaultBalance = 0.9 * userStakeBalance/totalStakeSize * totalVaultBalance
=> 0.1 * userVaultBalance * (boost - 1) = 0.9 * userStakeBalance/totalStakeSize * totalVaultBalance
=> (0.1 * userVaultBalance * (boost - 1) / (0.9 * totalVaultBalance)) * totalStakeSize = userStakeBalance
=> userVaultBalance * (boost - 1) / (9 * totalVaultBalance) * totalStakeSize = userStakeBalance
```

This means that if we know the target boost value, we can calculate the required amount stake size. For example, using the samples from the previous section, if the target boost is 8, user 2 will need to increase his stake balance to:

```
1000 * (8 - 1) / (9 * 3600) * 16000 ~= 3456.79
```

To reach maximum boost of 10, then the stake size needs to be increased to:

```
1000 * (10 - 1) / (9 * 3600) * 16000 ~= 4444.44
```

After a user reaches the maximum boost, if they deposit more to a vault, they will also need to increase they stake position in order to maintain the maximum boost. This will encourage users to get and stake more YOP tokens if they deposit more to the vaults.

### Smart Contract Changes

#### Vault Contract

##### Boosted Balances

The following new fields will be added to the Vault contract to store the boostedVaultBalance for each user and the totalBoostedVaultBalance:

```
mapping(address => uint256) private boostedUserBalances;
uint256 private totalBoostedBalance;
```

and with these new methods to read them:

```
// returns the boosted balance for a user
// initially, when the boosted balance of the user is 0, and the original balance of user is greater than 0, returns the original balance
function boostedBalanceOf(address _user) external returns (uint256);
// returns the total boosted balance of the vault. If totalBoostedBalance is 0 and totalSupply is not, return the value of totalSupply.
function totalBoostedSupply() external returns (uint256);
```

Every time when a user deposits/withdraws to/from a vault, these balances will be updated using the formula. It should also be updated when a user changes his/her staking position.

##### Boost Formula Weight Parameters

The numbers (0.1, 0.9) used in the boost formula are weight parameters. Since Solidity doesn't support floating numbers, the implementation will use the integer version of the formula by multiplying 10 to the formula:

```
boostedVaultBalance = min(1 * userVaultBalance + 9 * userStakeBalance/totalStakeSize * totalVaultBalance, 10 * userVaultBalance)
```

The final user reward share is the same as the original one.

We may want to change the weight parameters in this formula in the future, so we will store them as variables as well and may change them in the future:

```
struct BoostFormulaWeights {
  uint128 vaultBalanceWeight
  uint128 stakingBalanceWeight
}
// stores the weights used in the boost formula.
// initially it will be 1 for vaultBalanceWeight and 9 for stakingBalanceWeight
BoostFormulaWeights private boostFormulaWeights;
```

The following new methods will be added:

```
// update the weights of the boost formula
function setBoostFormulaWeights(uint128 vaultWeight, uint128 stakingWeight) onlyGovernance;
```

##### Support for Migration/Resetting Boosted Balances

We already have existing vaults that don't use the boosted balances, and we want to migrate them to use the boosted one without asking users to perform any additional actions. Also in the future when the parameters of the boost formula are changed, we will need to re-calculate the boosted balances for all users too without users performing any additional actions. To support these, we will add the following method:

```
// this function can be called by any one to update the boosted balances for the given array of users.
// for each user address, the function will:
// 1. call `calculateVaultRewards` function of the `YOPRewards` contract to update the rewards so far for the user address
// 2. calculate the new boosted balance value for the user, update the `totalBoostedBalance` using the existing boosted balance and the new boost balance, and then store the new boosted balance for the user address
function updateBoostedBalancesForUsers(address[] _users) external;
```

The reason this function can be called by anyone is to allow the community to self-policing/fair use of the boost. The boost can be abused because strictly speaking, when a user stakes, the value of `totalStakeSize` is actually changed for every user, and their boost value should be re-calculated. However, that will cost too much gas so it is not practical to do every time when a user stakes. Instead, they will be updated when user deposit/withdraw from vaults, or claiming rewards for a vault, or a user changes his/her staking position. This means if after a user get the maximum boost, he/she doesn't perform any of these actions, he/she may keep using it for a long time even though he/she should no longer get it after other people have staked. In this case, anyone can then call this function to update the boost for another user to bring down their boost value. The protocol will also set up recurring jobs to update the boost values for users periodically.

If the boost formula weight parameters are changed, we can use this same function to re-calculate the boosted balance for all users if the `_users` array contains all the users that have deposited into the vault. This information is very easy to find off-chain (e.g. using Etherscan), that's why we are not storing the array of users onchain.

#### YOPReward Contract

The changes to the YOP rewards contract is actually very simple - it will change from using the old `balanceOf` and `totalSupply` methods to use the new `boostedBalanceOf` and `totalBoostedSupply` methods when calculate the user rewards.

When user claims rewards for a vault, the `YOPRewards` contract will also call the `updateBoostedBalancesForUsers` function of the vault to update the user's boost balance (if changed).

#### Staking Contract

After a user stakes, he/she may want to apply the boost immediately to a vault (or a few vaults). To support this, a new method will be added to the staking contract:

```
// call the `updateBoostedBalancesForUsers` for each of the vault in the `_vaults` array to apply the boost for the user immediately after staking
function stake(uint248 _amount, uint8 _lockPeriod, address[] _vaults) external whenNotPaused returns (uint256)
```

#### Notes On Stake Transfer

It also worth noting that strictly speaking, if a staking NFT is transferred from one user to another, the boosted balances for both users in all the vaults they have deposits should be updated. However, that will cost too much gas and make the transfer of staking NFT extremely expensive. To avoid that, for now, the boosted balance won't be updated automatically. For users who have increased their stake (thus should increase their boost), they are likely incentivized to do it by themselves. For users who should decrease their boost, the protocol will set up automated jobs that will reset the boost APYs for users periodically.

### Challenges

As described in the previous section, majority of the changes required is in the Vault contract. However, this contract is already very close reaching the size limit, so it could be very difficult to add the new changes required. One way to deal with this is to move some of the stateless functions into libraries.
