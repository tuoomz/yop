# Overview

[COMP](https://etherscan.io/token/0xc00e94Cb662C3520282E6f5717214004A7f26888) is the governance token for the [Compound](https://compound.finance/) protocol. Compound is a decentralised lending protocol. Users can provide assets for others to borrow, and earn interests, or borrow assets with collateral (normally tokens) and pay interests. The interests are determined dynamically based on the supply and demand of a given asset.

Because the protocol is decentralised and managed by a DAO, the COMP token is introduced to help with the governance of the protocol. The COMP tokens are automatically distributed to all asset suppliers and borrowers, and this will allow the users to propose new changes and vote on proposals.

# Emission Schedule & Allocations

The max supply for COMP is `10,000,000` and from Compound's documentation:

> Each day, approximately 2,312 COMP will be distributed to users of the protocol; the distribution is allocated to each market (ETH, USDC, DAI…), and is set through the governance process by COMP token-holders.
>
> Within each market, half of the distribution is earned by suppliers, and the other half by borrowers.

The allocation of the COMP token to each market is determined by the DAO - they can propose changes to the allocation through the governance process.

The distribution of COMP to users are part of the core smart contracts of Compound, and every time when there are assets being supplied/borrowed, or when the allocation is changed for a market, the distribution of COMP to users are calculated, and the balance for each user is stored in the smart contract for users to claim.

# Claiming Tokens

Compound provides a dashboard where users can see the balance of their COMP tokens, and claim them if they want. When a user claims the COMP tokens, the `claim` function of the core Compound smart contract will be invoked and it will automatically calculate the amount of COMP tokens that user is eligible to (since last claim if the user has claim before) and transfer the tokens to the users' address. By default, it will calculate the amount across all the markets that the user have interacted with and transfer them all together to save gas.

# Implementation

## Smart Contracts For Emission

The main functions for calculating & distributing COMP tokens for users can be found in the [Comptroller smart contract](https://github.com/compound-finance/compound-protocol/blob/master/contracts/ComptrollerG7.sol#L1054).

The Comptroller is the risk management layer of the Compound protocol; it determines how much collateral a user is required to maintain, and whether (and by how much) a user can be liquidated.

## Analysis

### Mathematical Formula

Given the following conditions:

- The emission rate per second of the COMP token for a given market R<sub>m</sub>
- The total supply of the asset in the market S<sub>m</sub>
- The supply of a user in the market U<sub>m</sub>

The total COMP tokens that the user will get (C<sub>a</sub>) between start time t<sub>1</sub> (in seconds) and end time t<sub>2</sub> (in seconds) can be calculated as:

C<sub>a</sub> = (t<sub>2</sub> - t<sub>1</sub>) \* R<sub>m</sub> \* (U<sub>m</sub>/S<sub>m</sub>)

Among these values, R<sub>m</sub> (emission rate), S<sub>m</sub> (total supply) and U<sub>m</sub> (user supply) are not fixed and they will change. However, we can calculate the C<sub>a</sub> every time when any of these values changes, and add it up over time, that will give the number of COMP tokens a user should get:

T = (t<sub>1</sub> - t<sub>0</sub>) \* R<sub>0</sub> \* (U<sub>0</sub>/S<sub>0</sub>) + (t<sub>2</sub> - t<sub>1</sub>) \* R<sub>1</sub> \* (U<sub>1</sub>/S<sub>1</sub>) + (t<sub>3</sub> - t<sub>2</sub>) \* R<sub>2</sub> \* (U<sub>2</sub>/S<sub>2</sub>) + ...

This is basically what the code does to calculate the numbers.

### Code Analysis

#### State Variables

The following state variables are used to store the required information for calculation (copied from the `Comptroller` contract):

```solidity
struct CompMarketState {
    /// @notice The market's last updated compBorrowIndex or compSupplyIndex
    uint224 index;

    /// @notice The block number the index was last updated at
    uint32 block;
}

/// @notice The rate at which the flywheel distributes COMP, per block
uint public compRate;

/// @notice The portion of compRate that each market currently receives
mapping(address => uint) public compSpeeds;

/// @notice The COMP market supply state for each market
mapping(address => CompMarketState) public compSupplyState;

/// @notice The COMP market borrow state for each market
mapping(address => CompMarketState) public compBorrowState;

/// @notice The COMP borrow index for each market for each supplier as of the last time they accrued COMP
mapping(address => mapping(address => uint)) public compSupplierIndex;

/// @notice The COMP borrow index for each market for each borrower as of the last time they accrued COMP
mapping(address => mapping(address => uint)) public compBorrowerIndex;

/// @notice The COMP accrued but not yet transferred to each user
mapping(address => uint) public compAccrued;
```

These variables are fairly easy to understand with the help of code comments. For the `index` value - a simple way to understand it is to see it as the total accumulated COMP tokens for a given market or user over time.

#### Key Functions

As mentioned above, every time when there are changes made to the rate or the supply/borrow values, the number of COMP token accrued are calculated and added to the index variables. This is mainly achieved via the `updateCompSupplyIndex` and `distributeSupplierComp` functions (these are for suppliers only and there are similar functions for borrowers too).

The following is the source code of the `updateCompSupplyIndex` function:

```solidity
/**
 * @notice Accrue COMP to the market by updating the supply index
 * @param cToken The market whose supply index to update
 */
function updateCompSupplyIndex(address cToken) internal {
  CompMarketState storage supplyState = compSupplyState[cToken];
  uint256 supplySpeed = compSpeeds[cToken];
  uint256 blockNumber = getBlockNumber();
  uint256 deltaBlocks = sub_(blockNumber, uint256(supplyState.block));
  if (deltaBlocks > 0 && supplySpeed > 0) {
    uint256 supplyTokens = CToken(cToken).totalSupply();
    uint256 compAccrued = mul_(deltaBlocks, supplySpeed);
    Double memory ratio = supplyTokens > 0
      ? fraction(compAccrued, supplyTokens)
      : Double({ mantissa: 0 });
    Double memory index = add_(Double({ mantissa: supplyState.index }), ratio);
    compSupplyState[cToken] = CompMarketState({
      index: safe224(index.mantissa, "new index exceeds 224 bits"),
      block: safe32(blockNumber, "block number exceeds 32 bits")
    });
  } else if (deltaBlocks > 0) {
    supplyState.block = safe32(blockNumber, "block number exceeds 32 bits");
  }
}

```

The function calculates the number of COMP tokens a market will get when 1) the supply rate is changed for a market and 2) supply is added or removed from a market.

As you can see, from the code, the `index` value is actually the total value of:

I = (t<sub>1</sub> - t<sub>0</sub>) \* R<sub>0</sub> /S<sub>0</sub> + (t<sub>2</sub> - t<sub>1</sub>) \* R<sub>1</sub> /S<sub>1</sub> + (t<sub>3</sub> - t<sub>2</sub>) \* R<sub>2</sub> /S<sub>2</sub> + ...

This makes it easier to calculate the accrued COMP tokens for a supplier in the next function:

```solidity
/**
 * @notice Calculate COMP accrued by a supplier and possibly transfer it to them
 * @param cToken The market in which the supplier is interacting
 * @param supplier The address of the supplier to distribute COMP to
 */
function distributeSupplierComp(address cToken, address supplier) internal {
  CompMarketState storage supplyState = compSupplyState[cToken];
  /// Get the current total COMP tokens for the market
  Double memory supplyIndex = Double({ mantissa: supplyState.index });
  /// Get the total COMP tokens of the market when the last time this function is executed for the given supplier
  Double memory supplierIndex = Double({
    mantissa: compSupplierIndex[cToken][supplier]
  });
  /// Set the current total COMP tokens of the market for the supplier so that it can be used for calculation the next time this function is called for the supplier. The delta between the 2 can be viewed as the number of additional COMP tokens this market is getting since the last time the supplier provided/removed supply.
  compSupplierIndex[cToken][supplier] = supplyIndex.mantissa;

  if (supplierIndex.mantissa == 0 && supplyIndex.mantissa > 0) {
    supplierIndex.mantissa = compInitialIndex;
  }

  /// Get the total number of additional COMP tokens the market has got since last time
  Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
  /// Get the supply provided by the user
  uint256 supplierTokens = CToken(cToken).balanceOf(supplier);
  /// The number of COMP tokens the user will get in this period: (Total1/S - Total2/S) * U
  uint256 supplierDelta = mul_(supplierTokens, deltaIndex);
  /// The total number of COMP tokens the user will get so far since last claim
  uint256 supplierAccrued = add_(compAccrued[supplier], supplierDelta);
  compAccrued[supplier] = supplierAccrued;
  emit DistributedSupplierComp(
    CToken(cToken),
    supplier,
    supplierDelta,
    supplyIndex.mantissa
  );
}

```

In the code above, the value of `supplyIndex` is:

I<sub>n+1</sub> = (t<sub>1</sub> - t<sub>0</sub>) \* R<sub>0</sub> /S<sub>0</sub> + (t<sub>2</sub> - t<sub>1</sub>) \* R<sub>1</sub> /S<sub>1</sub> + ... + (t<sub>n</sub> - t<sub>n-1</sub>) \* R<sub>n</sub> /S<sub>n</sub> + (t<sub>n+1</sub> - t<sub>n</sub>) \* R<sub>n+1</sub> /S<sub>n+1</sub>

and `supplierIndex` is:

I<sub>n</sub> = (t<sub>1</sub> - t<sub>0</sub>) \* R<sub>0</sub> /S<sub>0</sub> + (t<sub>2</sub> - t<sub>1</sub>) \* R<sub>1</sub> /S<sub>1</sub> + ... + (t<sub>n</sub> - t<sub>n-1</sub>) \* R<sub>n</sub> /S<sub>n</sub>

so the value of `deltaIndex` for a given supplier is :

D<sub>n+1</sub> = I<sub>n+1</sub> - I<sub>n</sub> = (t<sub>n+1</sub> - t<sub>n</sub>) \* R<sub>n+1</sub> /S<sub>n+1</sub>

multiply by the value of the user supply (note the user supply value does not change between I<sub>n+1</sub> and I<sub>n</sub>. It changes after I<sub>n+1</sub>, otherwise this won't work.), will give us the accrued COMP tokens for the given user between `n+1` and `n`:

C<sub>n+1</sub> = (t<sub>n+1</sub> - t<sub>n</sub>) \* R<sub>n+1</sub> \* ( U<sub>n+1</sub> /S<sub>n+1</sub>)

The value stored in `compAccrued` will be the amount of tokens user can claim since the last time has claimed. The value will be reset to `0` once they are claimed:

```solidity
/**
 * @notice Claim all comp accrued by the holders
 * @param holders The addresses to claim COMP for
 * @param cTokens The list of markets to claim COMP in
 * @param borrowers Whether or not to claim COMP earned by borrowing
 * @param suppliers Whether or not to claim COMP earned by supplying
 */
function claimComp(
  address[] memory holders,
  CToken[] memory cTokens,
  bool borrowers,
  bool suppliers
) public {
  for (uint256 i = 0; i < cTokens.length; i++) {
    CToken cToken = cTokens[i];
    require(markets[address(cToken)].isListed, "market must be listed");
    if (borrowers == true) {
      Exp memory borrowIndex = Exp({ mantissa: cToken.borrowIndex() });
      updateCompBorrowIndex(address(cToken), borrowIndex);
      for (uint256 j = 0; j < holders.length; j++) {
        distributeBorrowerComp(address(cToken), holders[j], borrowIndex);
        compAccrued[holders[j]] = grantCompInternal(
          holders[j],
          compAccrued[holders[j]]
        );
      }
    }
    if (suppliers == true) {
      updateCompSupplyIndex(address(cToken));
      for (uint256 j = 0; j < holders.length; j++) {
        distributeSupplierComp(address(cToken), holders[j]);
        compAccrued[holders[j]] = grantCompInternal(
          holders[j],
          compAccrued[holders[j]]
        );
      }
    }
  }
}

```

The `grantCompInternal` function will transfer the tokens to user and return the remaining COMP tokens a user will have:

```solidity
/**
 * @notice Transfer COMP to the user
 * @dev Note: If there is not enough COMP, we do not perform the transfer all.
 * @param user The address of the user to transfer COMP to
 * @param amount The amount of COMP to (possibly) transfer
 * @return The amount of COMP which was NOT transferred to the user
 */
function grantCompInternal(address user, uint256 amount)
  internal
  returns (uint256)
{
  Comp comp = Comp(getCompAddress());
  uint256 compRemaining = comp.balanceOf(address(this));
  if (amount > 0 && amount <= compRemaining) {
    comp.transfer(user, amount);
    return 0;
  }
  return amount;
}

```
