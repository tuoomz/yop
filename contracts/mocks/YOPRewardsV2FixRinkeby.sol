// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;
import "../rewards/YOPRewardsV2.sol";

// This contract is to modify the current emission rate to fix a bug around calculating the current rewards emissions.
// The contract that contains the bug is only deployed to Rinkeby
contract YOPRewardsV2FixRinkeby is YOPRewardsV2 {
  function overrideCurrentEpochInfo(uint256 _epochRate, uint256 _epochCount) external onlyGovernance {
    currentEpoch.epochRate = _epochRate;
    currentEpoch.epochCount = _epochCount;
  }
}
