# Distribute fees as YOP tokens to stakers

## Author: Wei Li

## Problem Statement

At the moment, the [YopRewards contract](../../contracts/rewards/YOPRewards.sol) can only distribute community emissions (based on the YOP tokenomics) to users who stake their YOP tokens. However, in the future, there will additional rewards to be distributed to stakers. For example, as part of the tokenomics, when the protocol accrue enough fees from managing the vaults, it will buy YOP from the open market and distribute the fees to stakers.

But at the moment, there is no mechanism available to distribute these kinds of rewards. We need to build a mechanism to support this use case.

## Proposed Solution

### Calculating Rewards

Before talking about the solution, it's important to explain how the rewards are calculated currently first, and it will demonstrate the challenges to support distributing additional rewards.

Since the emission rate is already defined and fixed in the tokenomics, it is possible to calculate the exact number of the rewards each user will get per block/second.

For example, for the first month, the total number of YOP tokens that will be emitted is 342554, and one month on average is 2629743 seconds, that means:

RewardsPerSecond = 342554 / 2629743 ~= 0.13

Assuming all the rewards are allocated to users who stake their YOP tokens, and we only consider the amount of YOP token staked for simplicity.

User A first staked 100 YOP tokens. Before updating the balance, there is no rewards to any users as no one has staked. After updating the balance, we will have:

- total pool size: 100 YOP
- user A share: 100% (100 YOP)

After 1000 seconds, user B stakes another 100 YOP tokens. As part of the `stake` function, before updating the balance, we will calculate user A's rewards first up to this point:

- duration: 1000 seconds
- total amount of rewards: 0.13 \* 1000 = 130 YOP
- rewards per share of pool: 130 / 100 = 1.3 YOP
- user A rewards (for this duration) = 1.3 \* 100 = 130 YOP

Then we update the pool and user balances with user B's stake, and it will become:

- total pool size: 200 YOP
- user A share: 50% (100 YOP)
- user B share: 50% (100 YOP)
- user A rewards: 130 YOP

After another 1000 seconds, user A unstake from the pool. In the `unstake` function, before changing the balances, we will calculate the rewards for user A first:

- duration: 1000 seconds
- total amount of rewards: 0.13 \* 1000 = 130 YOP
- rewards per share of pool: 130 / 200 = 0.65 YOP
- user A rewards (for this duration) = 0.65 \* 100 = 65 YOP
- user B rewards (for this duration) = 0.65 \* 100 = 65 YOP

So the total rewards for user A will be: 130 + 65 = 195 YOP, which is the same as `100 * (130/100) + 100 * (130/200)`. Since user balance doesn't change, it can be written as `100 * (130/100 + 130/200)`, and `(130/100 + 130/200)` part can be seen as the total of `rewards per share`. This allows us to optimise the calculation even further: instead of storing an array of `rewards per share`, we actually just need to:

- A single value to store the total of `rewards per share` overtime.
- When a user first deposit/stake, store the value of this total of `rewards per share` at the time for this user.

When the user changes his/her position again, the rewards can be calculated as `userBalance * (currentTotalRewardsPerShare - userTotalRewardsPerShare)`.

Reuse the same example, after user A stakes, we will have:

- total pool size: 100 YOP
- user A share: 100% (100 YOP)
- total of rewards per share: 0 (no balance before user A stakes)
- total of rewards per share for user A: 0

then after user B stakes, we will have:

- total pool size: 200 YOP
- user A share: 50% (100 YOP)
- user B share: 50% (100 YOP)
- total of rewards per share: 1.3 (0 + 130/100)
- total of rewards per share for user A: 0
- total of rewards per share for user B: 1.3

when user A unstakes, we will calculate the `total of rewards per share`:

- total of rewards per share: 1.95 (0 + 130/100 + 130/200)

and the value of `total of rewards per share for user A` is 0, so the total rewards for user A is `100 * (1.95 - 0) = 195`, the same as `100 * (130/100) + 100 * (130/200)`. Similarly we can get the rewards for user B as well, which is `100 * (1.95 - 1.3) = 65`.

### Challenges

As you can see, the rewards are calculated using a "as-you-go" approach: whenever a user changes position in vaults or the staking contract, the rewards are calculated. The information store in the contract are compressed and can't be used to rebuild the historical changes, and this means that we don't have a way to retrospectively distribute new additional rewards to users.

However, what we can do is to add the additional rewards to future emissions - we only need to update the emission rate to reflect the new additional rewards, and as long as users keep their stakes, they will get the same amount of rewards as doing it retrospectively.

### Proposed Solution

#### Changes to the YOPRewards contract

Add the following new fields to the `YOPRewards` contract:

```
/// @dev record the total of additional rewards
uint256 totalAdditionalRewards;
/// @dev record additional rewards for epochs. The key will be the epoch count and the value is the additional rewards for that epoch.
mapping(uint256 => uint256) public additionalRewardsPerEpoch;
```

Add the following function to the `YOPRewards` contract:

```
/// @param _amount The amount of additional YOP tokens to distribute
/// @param _startIn In how many epochs to start the distribution of this reward. 1 means starting from the next epoch, and so on. It needs to be greater than 0 (which means the current epoch rate can't be changed)
/// @param _duration Use how many epochs to complete the distribution of the rewards. Needs to be greater or equal to 1.
function addRewards(uint256 _amount, uint256 _startIn, uint256 _duration) external {}
```

This function will:

1. Verify the input value first to ensure they are valid.
2. Check the caller to ensure it has at least the `_amount` of YOP tokens.
3. Transfer the `_amount` of YOP tokens from caller to the contract (contract needs to be approved to be the spender of the caller).
4. Increase the `totalAdditionalRewards`.
5. Based on the input value to calculate the new additional rewards for future epochs and update the internal mapping.
6. Emit an event for the new rewards.

Then when to calculate the emission rate for a future epoch, it will take the additional rewards into account.

The emission rate for the current epoch can't be changed. While technically it is possible to do, it will make the smart contract more complicated (which increases the gas cost) and prone to error. Also delaying the fee distribution is another way to keep user staking their YOP tokens.

There is an existing `rate` view only function that will return the emission rate and count for the current epoch. We will keep it to continue return the rate for community emissions, and add another function to return the rate for rewards:

```
function rewardsRate() external view returns (uint256 _rate, uint256 _epoch)
```

Combine the two we will be able to get the total emission rate for the current epoch.

Once we can distribute the fees as YOP tokens to stakers, we can automate the process by making some changes to the `FeeCollection` contract.

#### Changes to the FeeCollection contract

The [FeeCollection](../../contracts/fees/FeeCollection.sol) contract is used to collect the management and performance fees from all the vaults. The fees are collected in the native tokens of the vaults (WETH, USDC, WBTC etc). The following functions can be added to the `FeeCollection` contract to make it easier to buy YOP tokens using fees:

```
/// @dev Swap all the fees collected to ETH via SushiSwap or Uniswap
function swapForETH() external onlyGatekeeper {}
/// @dev Swap the given `_amount` of ETH balance of this contract for YOP using Uniswap
function buyYOP(uint256 _amount) external onlyGovernance {}
/// @dev Distribute the given `_amount` YOP to stakers by calling the `addRewards` function of the `YOPRewards` contract. The fees will be emitted in the given `_duration` of epochs.
function distributeYOP(uint256 _amount, uint256 _duration) external onlyGovernance {}
/// @dev A zap function that will swap fees for ETH, and buy YOP for the given `_ethAmount` of ETH, and distribute them to stakers by calling the `addRewards` function of the `YOPRewards` contract.  The fees will be emitted in the given `_duration` of epochs.
function swapAndDistributeFee(uint256 _ethAmount, uint256 _duration) external onlyGovernance {}
/// @dev Allow governance to withdraw the given amount of ETH from the contract. This will allow the governance to withdraw fees to cover other costs
function withdraw(uint256 _ethAmount, address _to) external onlyGovernance {}
/// @dev Return the estimated total balance in ETH for all the fees
function estimatedETHBalance() external view returns (uint256) {}
```

Once these functions are added, governance just needs to call the `swapAndDistributeFee` function to swap fees for YOP tokens and add them as additional rewards to stakers.
