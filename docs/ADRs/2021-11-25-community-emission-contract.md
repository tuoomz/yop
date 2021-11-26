# YOP Community Token Emission Contract

## Author: Wei Li

## Problem Statement

According to the YOP tokenomics described in the white paper, 27% of the total YOP tokens (about 24 million) will be allocated to the YOP community - that's all the users who provide liquidity to the YOP vaults, and users who stake their YOP tokens (which will come later). The emission will start Jan 2022, and be released over a 10 year period on a reducing balance schedule of 1% per month, and the initial supply for the first month is 342,553.93.

Initially all the emissions for the community will be distributed among all liquidity providers across the vaults. However,later on when the staking function is available, a part of the emissions will be directed towards users who stake their YOP tokens. So the allocation to the vault users need to be configurable.

Also this allocation is not evenly distributed among all the vaults. For example, for a new vault it might get higher percentage of allocation to boost its TVL, and for a vault that TVL is high, we might reduce the percentage to incentivize users to move their tokens to other vaults. This means that the allocations to vaults need to be configurable too.

Based on the above description, the smart contract will be able to:

1. Allow governance to configure the percentage allocation of the supply to the vault users.
2. Allow governance to configure the weight of each vault for the allocation.
3. Calculate how many YOP tokens each vault user will have.
4. Allow vault users to claim their YOP tokens.

## Proposed Solution

### Calculating Emission Rate

Based on the emission schedule, the emission rate `r` (per second) for the first month will be `342,553.93/(30*24*60*60) = 0.132158` (for consistency, we always use 30 days for a month). Then for any given month `n` the emission rate can be calculated as:

r \* (1 - 0.01)<sup>n-1</sup>

`P` represents the percentage that will be allocated to the vault users, so the actual rate will be:

r \* P \* (1 - 0.01)<sup>n-1</sup>

The initial value of P wil be 100% but it will be configurable.

### Setting Vault Weights

For the initial version, the weight for vaults will be set manually. These value will then stored in a map inside the contract, and the contract will provide a function that can be invoked by the governance to set the weight for each vault. The function should accept an array of vaults and an array of weights that are corresponding to the vaults.

### Reward Calculation

To calculate the rewards, it will follow the same algorithm that is used by both [Compound](../research/token-emission/compound.md#mathematical-formula) and [Curve](../research/token-emission/curve.md#mathematical-formula).

Implementation wise, it will mainly follow the approach taken by the [compound protocol](../research/token-emission/compound.md#key-functions), have one function to calculate the index for the vault, and another function to calculate the index for the user. However, the main difference there is that we need to take the emission rate changes into consideration. It will change every month and it is possible that there are many months in-between when the function is invoked. The [Curve protocol](../research/token-emission/curve.md#liquiditygauge-contract) provides some examples of how we can solve this problem.

These functions need to be invoked when:

- Every time when a user deposits or withdraws from any Vault
- Every time when there is a change to the Vault weight
- Every time when a user claim the rewards

This means that the Vault contract will need to be updated to call the functions in this contract when user deposits or withdraws.

### Claiming Rewards

The contract should provide a `claim` function that can be used by users to claim their YOP tokens. This function should also accept an array of Vault addresses so that if a user provide liquidity to multiple vaults, the YOP rewards across all vaults can be claimed in one go.

### Approving Spending Limits

In order to allow users to claim YOP tokens through this contract, the contract needs to be approved as the spender of YOP community token wallet. This needs to be done manually by the owner of the wallet owner.

Obviously the most cost effective way is to set the limit to be maximum in a single approval, but that means all the tokens could be drained if this contract got hacked. To mitigate the risk, we can set the limit to be a lower value - e.g. a value that is enough for a few months worth of emissions, and we just need to do the approval regularly to ensure the contract can transfer YOP tokens to users. The contract will make sure the transfer is successful before resetting the claimable balance for a user.

### Contract Interface

Based on the above descriptions, the contract should at least have the following methods:

```solidity
interface IYOPVaultRewards {
  /// Returns the current emission rate for vault rewards
  function rate() external view returns (uint256);

  /// Returns the current percentage for vault users of the community rewards
  function rewardsRatio() external view returns (uint256);

  /// Set the percentage for vault users of the community rewards. Governance only. Should emit an event.
  function setRewardsRatio(uint256 ratio) external;

  /// Get the weight of a Vault
  function vaultWeight(address vault) external view returns (uint256);

  /// Set the weights for vaults. Governance only. Should emit events.
  function setVaultWeight(address[] vaults, uint256[] weights) external;

  /// Calculate the rewards for the given user in the given vault. Vaults Only.
  /// This should be called by every Vault every time a user deposits or withdraws.
  function calculateRewards(address vault, address user) external;

  /// Allow a user to claim the accrued rewards and transfer the YOP tokens to the given account. Should emit events.
  function claim(address[] vaults, address to) external;
}

```

## References

- [COMP Token Emissions for Compound](../research/token-emission/compound.md)
- [CRV Token Emissions for Curve](../research/token-emission/curve.md)
