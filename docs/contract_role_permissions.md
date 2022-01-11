# Smart Contract Roles and Permissions

This serves as an active document to maintain a list of all contract roles and their permissions.

- [Smart Contract Roles and Permissions](#smart-contract-roles-and-permissions)
  - [Access](#access)
  - [Vaults](#vaults)
  - [Strategies](#strategies)
    - [Convex](#convex)

## Access

| Access |                             | Governance | Gatekeeper | Manager | Strategist | Keeper |
| ------ | --------------------------- | :--------: | :--------: | :-----: | :--------: | :----: |
|        | addAccessControlPolicies    |     x      |     x      |         |            |        |
|        | removeAccessControlPolicies |     x      |     x      |         |            |        |
|        | allowGlobalAccess           |     x      |            |         |            |        |
|        | removeGlobalAccess          |     x      |            |         |            |        |
|        | allowVaultAccess            |     x      |     x      |         |            |        |
|        | removeVaultAccess           |     x      |     x      |         |            |        |
|        | addVaultToNftMapping        |     x      |     x      |         |            |        |
|        | removeVaultToNftMapping     |     x      |     x      |         |            |        |
|        | setVaultGatekeeper          |     x      |            |         |            |        |

## Vaults

| Vaults |                                        | Governance | Gatekeeper | Manager | Strategist | Keeper |
| ------ | -------------------------------------- | :--------: | :--------: | :-----: | :--------: | :----: |
|        | proposeGovernance                      |     x      |            |         |            |        |
|        | acceptGovernance<sup>\*</sup>          |     x      |            |         |            |        |
|        | setGovernance                          |     x      |            |         |            |        |
|        | setManagement                          |     x      |            |         |            |        |
|        | setProfitLimitRatio                    |     x      |            |    x    |            |        |
|        | setLossLimitRatio                      |     x      |            |    x    |            |        |
|        | setStrategyLimits                      |     x      |            |    x    |            |        |
|        | setCheck                               |     x      |            |    x    |            |        |
|        | setDisabledCheck                       |     x      |            |    x    |            |        |
|        | pause                                  |     x      |     x      |         |            |        |
|        | unpause                                |     x      |            |         |            |        |
|        | sweep                                  |     x      |            |         |            |        |
|        | setRewards                             |     x      |            |         |            |        |
|        | setManagementFee                       |     x      |            |         |            |        |
|        | setGatekeeper                          |     x      |            |         |            |        |
|        | setStrategyDataStore                   |     x      |            |         |            |        |
|        | setHealthCheck                         |     x      |     x      |         |            |        |
|        | setVaultEmergencyShutdown<sup>\*</sup> |     x      |     x      |         |            |        |
|        | setLockedProfileDegradation            |     x      |            |         |            |        |
|        | setDepositLimit                        |     x      |     x      |         |            |        |
|        | setAccessManager                       |     x      |     x      |         |            |        |
|        | setVaultManager                        |     x      |            |         |            |        |
|        | setMaxTotalDebtRatio                   |     x      |            |    x    |            |        |
|        | addStrategy                            |     x      |            |    x    |            |        |
|        | updateStrategyPerformanceFee           |     x      |            |    x    |            |        |
|        | updateStrategyMinDebtHarvest           |     x      |            |    x    |            |        |
|        | updateStrategyMaxDebtHarvest           |     x      |            |    x    |            |        |
|        | setWithdrawQueue                       |     x      |            |    x    |            |        |
|        | addStrategyToWithdrawQueue             |     x      |            |    x    |            |        |
|        | removeStrategyFromWithdrawQueue        |     x      |            |    x    |            |        |
|        | migrateStrategy                        |     x      |            |         |            |        |
|        | revokeStrategy                         |     x      |            |    x    |            |        |

_Notes_:

- acceptGovernance<sup>\*</sup> - only a pending Governance
- setVaultEmergencyShutdown<sup>\*</sup> - Governance and Gatekeeper can put a vault into emergency shutdown. Only Governance can remove it.

## Strategies

| Strategies |                   | Governance | Gatekeeper | Manager | Strategist | Harvester |
| ---------- | ----------------- | :--------: | :--------: | :-----: | :--------: | :-------: |
|            | setStrategist     |     x      |            |         |     x      |           |
|            | setKeeper         |     x      |            |         |     x      |           |
|            | setVault          |     x      |            |         |     x      |           |
|            | setRewards        |            |            |         |     x      |           |
|            | setMinReportDelay |     x      |            |         |     x      |           |
|            | setMaxReportDelay |     x      |            |         |     x      |           |
|            | setProfitFactor   |     x      |            |         |     x      |           |
|            | setDebtThreshold  |     x      |            |         |     x      |           |
|            | setMetadataURI    |     x      |            |         |     x      |           |
|            | tend              |     x      |            |         |     x      |     x     |
|            | harvest           |     x      |            |         |     x      |     x     |
|            | migrate           |     x      |            |         |            |           |
|            | setEmergencyExit  |     x      |            |         |     x      |           |
|            | sweep             |     x      |            |         |            |           |

### Convex

| Convex |                               | Governance | Gatekeeper | Manager | Strategist | Keeper |
| ------ | ----------------------------- | :--------: | :--------: | :-----: | :--------: | :----: |
|        | withdrawToConvexDepositTokens |     x      |            |         |     x      |        |
|        | setCrvRouter                  |     x      |            |         |     x      |        |
|        | setCvxRouter                  |     x      |            |         |     x      |        |
|        | setHarvestExtras              |     x      |            |         |     x      |        |
|        | setClaimRewards               |     x      |            |         |     x      |        |
|        | setHarvestProfitFactor        |     x      |            |         |     x      |        |
