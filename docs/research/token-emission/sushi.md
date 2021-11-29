# Overview

[SUSHI](https://etherscan.io/token/0x6b3595068778dd592e39a122f4f5a5cf09c90fe2) is the governance token for the [Sushi](https://compound.finance/) protocol. At its core SushiSwap is just a [Uniswap v2](https://docs.uniswap.org/protocol/V2/introduction) fork. SushiSwap enables the buying and selling of different cryptocurrencies between users. The SUSHI token is intended to perform several functions, all of which come down to one primary value proposition: protocol ownership.

The MasterChef enables the minting of new SUSHI token. It's the only way that SUSHI tokens are created. This is possible by staking LP tokens inside the MasterChef. (More detail in the implementation section)

- Revenue share
- Governance

# Emission Schedule & Allocations

The tokenomics (SUSHINOMICS as they like to call it) can be broken down as follows:

- 250 million $SUSHI hard cap.
- 10% of all emissions go to their Multisig-controlled treasury/dev fund.
- Expected date to reach hard cap is _November 2023_.
- 0.05% of the exchange trade fees are awarded to holders of the xSUSHI token and 0.25% goes to liquidity providers

You can view the projected emissions curve and supply totals [here.](https://lh6.googleusercontent.com/s0lFogwf3V8thEvPp28qwAvNPyfciU4bAXjI3VKuqud_WGu_Ui1h5OUWXErpS_9neBGMQhWdauIMn8EYNWrraIsfujhM3OLmpLRfv8u3iszVWNOuTjtaSrj3-MkhWQm0GFTmUdK0)

The a pools reward variables are recalculated when are users being depositing/withdrawing. When a new pool is introduced or an existing pool has its allocation points updated there is a flag to mass update all pools to recalculate reward variables.

# Harvest Rewards

Masterchef contract will automatically send any pending awards at deposit/withdrawal time. The user cannot claim these outside of deposit/withdraw .(ie no claim/harvest function available)

# Implementation

## Emission per Block

[MasterChef](https://github.com/sushiswap/sushiswap/blob/master/contracts/MasterChef.sol) contract is responsible for calculating and providing incentives to users for providing liquidity on SushiSwap. It gives out a constant number of **SUSHI per Block** (100). The introduction of the 250 million $SUSHI hard cap introduced a need to reduce emissions over time.

A "reduce" pool [REDUCE (REDUCE)](https://etherscan.io/address/0xfb736dAd22b879f055C7aebF3A2E8a197F923Ea1) - which they've burned the "ownership" of the token is used to create/maintain a custom allocation point to control emission reduction. To try simplify this, it means most of the sushi rewards are attributed to this pool but will never be claimed so this allows for the reduction of emissions.

When new $SUSHI is minted per block - 10% is minuted for the developer/treasury address. This can be see [here](https://github.com/sushiswap/sushiswap/blob/master/contracts/MasterChef.sol#L221-L226). As the balance of the _REDUCE_ pool is `0`, 10% is **not** minted for the developer/treasury address when calculating the award for this pool.

Thus current emission per block can be calculated as so:

e<sub>m</sub> - ((a<sub>m</sub> / t<sub>m</sub>) \* e<sub>m</sub>)
Where:

- e<sub>m</sub> - Constant emission per block (100) (available from contract)
- a<sub>m</sub> - Allocation points assigned to `REDUCE` pool (available from contract)
- t<sub>m</sub> - Total allocation points. (Sum of all allocation points in all pools, available from contract)

NOTE: Confirmed with Sushi Engineering group on discord allocation points assigned to `REDUCE` pool are regularly updated to reduce emissions to reach 250m SUSHI hardcap. How the allocation points are calculated is not transparent and they just say to can follow an estimation of the emissions (not exactly the same numbers) [here](https://docs.sushi.com/faq-1/sushi-nomics-faq). As of today, 29 Nov 2021, it is almost a year ahead of schedule as it is currently at ~5.2 sushi per block.

## Sushi Awarded Per Pool

Number of sushi allocated to a pool is calculated as below:
s<sub>m</sub> \* (a<sub>m</sub> / t<sub>m</sub>)

Where:

- s<sub>m</sub> - constant emission per block (100)
- a<sub>m</sub> - allocation points assigned to the pool
- t<sub>m</sub> - total allocation points

## Sushi Awarded per user

Number of sushi allocated to a user in a pool is calculated at deposit/withdraw as below:

U<sub>a</sub> \* (S<sub>p</sub> - U<sub>r</sub>)

Where:

- U<sub>a</sub> - number of LP token a user has in this pool (user.amount)
- S<sub>p</sub> - the pools current accSushiPerShare (Accumulated SUSHIs per share)
- U<sub>r</sub> - users current `rewardDebt`

When a user deposits/withdraws LP tokens to/from a pool below is the flow of what happens:

1. Update the pool's `accSushiPerShare`(Accumulated SUSHIs per share and the `lastRewardBlock` variable gets updated
2. User pending reward is calculated and sent to their address
3. Users `amount` is updated
4. Users `rewardDebt` is updated

### Code

`updatePool`

```solidity
// Update reward variables of the given pool to be up-to-date.
function updatePool(uint256 _pid) public {
  PoolInfo storage pool = poolInfo[_pid];
  if (block.number <= pool.lastRewardBlock) {
    return;
  }
  uint256 lpSupply = pool.lpToken.balanceOf(address(this));
  if (lpSupply == 0) {
    pool.lastRewardBlock = block.number;
    return;
  }
  uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
  uint256 sushiReward = multiplier.mul(sushiPerBlock).mul(pool.allocPoint).div(
    totalAllocPoint
  );
  sushi.mint(devaddr, sushiReward.div(10));
  sushi.mint(address(this), sushiReward);
  pool.accSushiPerShare = pool.accSushiPerShare.add(
    sushiReward.mul(1e12).div(lpSupply)
  );
  pool.lastRewardBlock = block.number;
}

```

`updatePool` is responsible for calculating a pools sushi rewards, minting the sushi and setting the pools SUSHIs per share ratio (Accumulated SUSHIs per share). This only triggered once per block - `block.number <= pool.lastRewardBlock`. There is also a safety check to ensure that if a pool has no balance no rewards are calculated.

To update a pool:

- The sushiReward is calculated as discussed above. (sushiPerBlock (for that pool) x pool allocation point) / total allocation point of all pools.
- 10% of the sushiReward is calculated, minted and set to the dev/treasury address.
- The full sushiReward is then minted.
- The pools accumulated SUSHIs per share is recalculated.
- The `lastRewardBlock` is updated as the current block number.

Note: `multiplier` is no longer used. It was a reward program for early adopters that ended after block `10850000`.

`deposit`

```solidity
// Deposit LP tokens to MasterChef for SUSHI allocation.
function deposit(uint256 _pid, uint256 _amount) public {
  PoolInfo storage pool = poolInfo[_pid];
  UserInfo storage user = userInfo[_pid][msg.sender];
  updatePool(_pid);
  if (user.amount > 0) {
    uint256 pending = user.amount.mul(pool.accSushiPerShare).div(1e12).sub(
      user.rewardDebt
    );
    safeSushiTransfer(msg.sender, pending);
  }
  pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
  user.amount = user.amount.add(_amount);
  user.rewardDebt = user.amount.mul(pool.accSushiPerShare).div(1e12);
  emit Deposit(msg.sender, _pid, _amount);
}

```

From the above we can updatePool is called for every deposit to calculate the sushiReward for the pool.
This also updates the pools accSushiPerShare (only updated once in a block)
If this is not the first time a user has deposited, any pending awards are calculated (using calculations discussed above) and issued to the user.
The LP tokens are then transferred to the MasterChef Contract.
The user amount is updated.
The user rewardDebt is calculated as U<sub>a</sub> \* S<sub>p</sub> (user amount x pools accumulated SUSHIs per share)

`withdraw`

```solidity
// Withdraw LP tokens from MasterChef.
function withdraw(uint256 _pid, uint256 _amount) public {
     PoolInfo storage pool = poolInfo[_pid];
     UserInfo storage user = userInfo[_pid][msg.sender];
     require(user.amount >= _amount, "withdraw: not good");
     updatePool(_pid);
     uint256 pending =
         user.amount.mul(pool.accSushiPerShare).div(1e12).sub(
             user.rewardDebt
         );
     safeSushiTransfer(msg.sender, pending);
     user.amount = user.amount.sub(_amount);
     user.rewardDebt = user.amount.mul(pool.accSushiPerShare).div(1e12);
     pool.lpToken.safeTransfer(address(msg.sender), _amount);
     emit Withdraw(msg.sender, _pid, _amount);
   }
}
```

From the above we can updatePool is called for every deposit to re-calculate the sushiReward for the pool.
Users pending awards are calculated (using calculations discussed above) and issued to the user.
The user amount is reduced
The user rewardDebt is recalculated as U<sub>a</sub> \* S<sub>p</sub> (reduced user amount x pools accumulated SUSHIs per share)
The LP tokens are then transferred back to the user.
