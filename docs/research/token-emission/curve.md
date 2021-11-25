# Overview

Curve is a decentralised protocol that is mainly designed to allow users to swap stable coins with low fees and low slippage. The [CRV](https://etherscan.io/token/0xD533a949740bb3306d119CC777fa900bA034cd52) token is to incentivise liquidity providers on the Curve Finance platform as well as getting as many users involved as possible in the governance of the protocol.

Any liquidity providers to the Curve protocol is eligible to get CRV tokens. However, only holding CRV tokens don't have a lot of benefits and don't allow the holders to participate in DAO activities for Curve. Instead, they need to stake (lock) CRV tokens and in exchange for the `veCRV` (stands for Voting Escrow CRV) to get the full benefits, including participating in governance activities.

This document will mainly focus on how CRV tokens are distributed to liquidity providers within the Curve protocol.

# Emission Schedule & Allocations

The total supply of CRV is about 3.03 billion and the initial supply is 1.273 billion (about 43%). The initial supply is allocated to shareholders, employees, reserve and early users, and they are gradually vested with every block.

The rest are for what they call `inflation`, which effectively is for the Curve community and will be released to all the liquidity providers over time. The initial inflation rate is 22.0% (about 279.6 million per year, and it is reduced by 2<sup>1/4</sup> each year. Majority of the tokens will be in circulation within about 6 years (from Aug 2020 to May 2026), but the emission will never stops as the inflation will never reach 0.

## Gauges

The way that the CRV tokens are distributed to LPs are a bit more complicated compared to some of the other protocols, they are distributed through the [gauge system](https://resources.curve.fi/base-features/understanding-gauges).

Each pool will have an associated gauge. Each gauge is another smart contract where all LP of the pool can deposit their LP tokens into. LPs can only get CRV tokens after depositing their LP tokens into the gauge. The CRVs are then distributed to all the gauges, and then distributed to LP based on the percentage of their contribution.

Each gauge has a weight value and that will decide the percentages of CRV inflation it will get. Every week the DAO members of Curve can decide the weight of each gauge by voting using their veCRV tokens. The gauge weights are updated on every Thursday.

# Claiming Tokens

The gauge smart contracts store the balances of CRV tokens each LP of the pool can claim, and a [Minter smart contract](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/Minter.vy) is used to claim the tokens. It has methods to allow LPs to claim CRVs tokens from a single pool or across all the pools.

# Implementation

## Smart Contracts For Emission

There are mainly 2 smart contracts that are directly related to the CRV token emissions: the [CRV token contract](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/ERC20CRV.vy) itself, and the [gauge contract](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/gauges/LiquidityGaugeV3.vy). The former determines the overall rate of the CRV inflation, while the latter determines how many CRV tokens a LP will get in a pool.

## Analysis

### Mathematical Formula

#### Token Emission Rates

As described in the section above, since the initial supply of CRV tokens and the inflation rates are fixed, it is quite easy to calculate the rate of CRV emissions for year _n_:

Given inflation const _I_, initial supply _S_, and number of seconds in a year const _Y_

R<sub>n</sub> = R<sub>n-1</sub> \* _I_

where R<sub>0</sub> = _S_/_Y_.

#### CRVs for Liquidity Providers

The [Curve gauges documentation](https://curve.readthedocs.io/dao-gauges.html#liquidity-gauges) provides a good description for how the CRVs are distributed to LPs within a gauge. In summary, given the following conditions:

- The emission rate per second of the CRV token R
- The weight of gauge W<sub>g</sub>
- The weight of the gauge type W<sub>t</sub>
- The total number of LP tokens in the gauge S<sub>g</sub>
- The LP token balance for user in the gauge U<sub>g</sub>

The total CRV tokens that the user will get (C<sub>a</sub>) between start time t<sub>1</sub> (in seconds) and end time t<sub>2</sub> (in seconds) can be calculated as:

C<sub>a</sub> = (t<sub>2</sub> - t<sub>1</sub>) \* R \* W<sub>g</sub> \* W<sub>t</sub> \* (U<sub>g</sub>/S<sub>g</sub>)

Essentially, it is the same as the [method used by Compound](./compound.md#mathematical-formula). The only difference is that to determine the token emission rate for a gauge, in Curve it needs to take gauge type and gauge weight into consideration.

### Code Analysis

#### CRV Token Emission Contract

The CRV token contract defined the following state variables that are related to token emission:

```python
# General constants
YEAR: constant(uint256) = 86400 * 365


INITIAL_SUPPLY: constant(uint256) = 1_303_030_303
INITIAL_RATE: constant(uint256) = 274_815_283 * 10 ** 18 / YEAR  # leading to 43% premine
RATE_REDUCTION_TIME: constant(uint256) = YEAR
RATE_REDUCTION_COEFFICIENT: constant(uint256) = 1189207115002721024  # 2 ** (1/4) * 1e18
RATE_DENOMINATOR: constant(uint256) = 10 ** 18

# Supply variables
mining_epoch: public(int128)
start_epoch_time: public(uint256)
rate: public(uint256)

start_epoch_supply: uint256
```

In the contract, the `rate` variable is public and this will allow other contract to query the current emission rate. The emission rate will stay the same for each epoch. Each epoch is approximately a year. The first epoch started around May 2020.

The following function will start a new epoch and update the rate:

```python
@internal
def _update_mining_parameters():
  """
  @dev Update mining rate and supply at the start of the epoch
        Any modifying mining call must also call this
  """
  _rate: uint256 = self.rate
  _start_epoch_supply: uint256 = self.start_epoch_supply

  self.start_epoch_time += RATE_REDUCTION_TIME
  self.mining_epoch += 1

  if _rate == 0:
      _rate = INITIAL_RATE
  else:
      _start_epoch_supply += _rate * RATE_REDUCTION_TIME
      self.start_epoch_supply = _start_epoch_supply
      _rate = _rate * RATE_DENOMINATOR / RATE_REDUCTION_COEFFICIENT

  self.rate = _rate

  log UpdateMiningParameters(block.timestamp, _rate, _start_epoch_supply)
```

It worth noting that this function needs to be revoked at least once and only once in each epoch to change the rate. It will be invoked whenever a user deposits or withdraws from a gauge, so it doesn't need to be invoked manually almost all the time.

##### LiquidityGauge Contract

In the [LiquidityGauge contract](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/gauges/LiquidityGaugeV3.vy), the following state variables are used for calculate the token distribution:

```python
# The goal is to be able to calculate ∫(rate * balance / totalSupply dt) from 0 till checkpoint
# All values are kept in units of being multiplied by 1e18
period: public(int128)
period_timestamp: public(uint256[100000000000000000000000000000])

# 1e18 * ∫(rate(t) / totalSupply(t) dt) from 0 till checkpoint
integrate_inv_supply: public(uint256[100000000000000000000000000000])  # bump epoch when rate() changes

# 1e18 * ∫(rate(t) / totalSupply(t) dt) from (last_action) till checkpoint
integrate_inv_supply_of: public(HashMap[address, uint256])
integrate_checkpoint_of: public(HashMap[address, uint256])

# ∫(balance * rate(t) / totalSupply(t) dt) from 0 till checkpoint
# Units: rate * t = already number of coins per address to issue
integrate_fraction: public(HashMap[address, uint256])
inflation_rate: public(uint256)
```

and the following function is used to do the calculation:

```python
@internal
def _checkpoint(addr: address):
    """
    @notice Checkpoint for a user
    @param addr User address
    """
    _period: int128 = self.period
    _period_time: uint256 = self.period_timestamp[_period]
    _integrate_inv_supply: uint256 = self.integrate_inv_supply[_period]
    rate: uint256 = self.inflation_rate
    new_rate: uint256 = rate
    prev_future_epoch: uint256 = self.future_epoch_time
    if prev_future_epoch >= _period_time:
        _token: address = self.crv_token
        self.future_epoch_time = CRV20(_token).future_epoch_time_write()
        new_rate = CRV20(_token).rate()
        self.inflation_rate = new_rate

    if self.is_killed:
        # Stop distributing inflation as soon as killed
        rate = 0

    # Update integral of 1/supply
    if block.timestamp > _period_time:
        _working_supply: uint256 = self.working_supply
        _controller: address = self.controller
        Controller(_controller).checkpoint_gauge(self)
        prev_week_time: uint256 = _period_time
        week_time: uint256 = min((_period_time + WEEK) / WEEK * WEEK, block.timestamp)

        for i in range(500):
            dt: uint256 = week_time - prev_week_time
            w: uint256 = Controller(_controller).gauge_relative_weight(self, prev_week_time / WEEK * WEEK)

            if _working_supply > 0:
                if prev_future_epoch >= prev_week_time and prev_future_epoch < week_time:
                    # If we went across one or multiple epochs, apply the rate
                    # of the first epoch until it ends, and then the rate of
                    # the last epoch.
                    # If more than one epoch is crossed - the gauge gets less,
                    # but that'd meen it wasn't called for more than 1 year
                    _integrate_inv_supply += rate * w * (prev_future_epoch - prev_week_time) / _working_supply
                    rate = new_rate
                    _integrate_inv_supply += rate * w * (week_time - prev_future_epoch) / _working_supply
                else:
                    _integrate_inv_supply += rate * w * dt / _working_supply
                # On precisions of the calculation
                # rate ~= 10e18
                # last_weight > 0.01 * 1e18 = 1e16 (if pool weight is 1%)
                # _working_supply ~= TVL * 1e18 ~= 1e26 ($100M for example)
                # The largest loss is at dt = 1
                # Loss is 1e-9 - acceptable

            if week_time == block.timestamp:
                break
            prev_week_time = week_time
            week_time = min(week_time + WEEK, block.timestamp)

    _period += 1
    self.period = _period
    self.period_timestamp[_period] = block.timestamp
    self.integrate_inv_supply[_period] = _integrate_inv_supply

    # Update user-specific integrals
    _working_balance: uint256 = self.working_balances[addr]
    self.integrate_fraction[addr] += _working_balance * (_integrate_inv_supply - self.integrate_inv_supply_of[addr]) / 10 ** 18
    self.integrate_inv_supply_of[addr] = _integrate_inv_supply
    self.integrate_checkpoint_of[addr] = block.timestamp
```

Since it's possible for a LP to not interact with the LiquidityGauge contract for quite a long time, and Curve don't want to require users to do periodical checkins with the contract, when calculate the CRV token distributions, it needs to take that into account. The inflation rate could change if the user's last checkin is in the previous epoch, and the weight of the gauge changes from week to week.

##### Minter Contract

The `integrate_fraction` variable stores the total number of CRV tokens a LP will get, and the [Minter](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/Minter.vy) contract will use to to decide how many tokens a LP will get for each claim:

```python
@internal
def _mint_for(gauge_addr: address, _for: address):
    assert GaugeController(self.controller).gauge_types(gauge_addr) >= 0  # dev: gauge is not added

    LiquidityGauge(gauge_addr).user_checkpoint(_for)
    total_mint: uint256 = LiquidityGauge(gauge_addr).integrate_fraction(_for)
    to_mint: uint256 = total_mint - self.minted[_for][gauge_addr]

    if to_mint != 0:
        MERC20(self.token).mint(_for, to_mint)
        self.minted[_for][gauge_addr] = total_mint

        log Minted(_for, gauge_addr, total_mint)
```
