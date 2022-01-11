# Gnosis Hardhat Tasks

This serves as an active document to maintain a list of custom hardhat tasks for Gnosis and how they can be used.

## Create Safe

Creates a new gnosis safe.
**NOTE**: Private key used will pay the associated transaction fees creating the safe.

| Params       | Description                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| --owners     | Comma separated list of safe owners addresses. _note:_ Signer wallet is not added as an owner by default and must be added to this list. |
| --privatekey | Private key of a Signer wallet used to create the safe and pay the transaction fees                                                      |
| --threshold  | No. of confirmations a transaction needs before it can be executed                                                                       |
| --network    | rinkeby, mainnet etc                                                                                                                     |

Example (rinkeby):

```bash
npx hardhat gnosis:create-safe --owners 0x45A788291aB8c6dAcf7f3a680484438D468f0839,0xCe6F06f4281CC5313936836eb39b93a75c866C3b --threshold 1 --privatekey 1111111111111111111111111111111111111111111111111111 --network rinkeby
```

Output:

```bash
Private Key Loaded for Wallet: 0xE40ebF6668b7bFB2205bDc7604fa3a9AC8dBc529

>>>>>> Safe Created  <<<<<<<<
Safe Address: 0x852E3B7e353Af35BC42EF457685Ac129aB211191
Owners: 0x45A788291aB8c6dAcf7f3a680484438D468f0839,0xCe6F06f4281CC5313936836eb39b93a75c866C3b
Threshold: 1

By Default, the safe won't load in the gnosis UI unless you are an owner. You will need to add it manually using the safe address above. Visit https://gnosis-safe.io/app/load to do this.
```

## Propose Transaction

Allows automation proposed contract interactions to a gnosis safe. Particularly useful contract configuration in an automated way.

NOTE: This will only propose txn using a "delegated address". Delegated address are ones that are approved to send transactions to a safe.
Our scripts will use KMS to be the signer and propose these. Read more [here](https://github.com/gnosis/safe-docs/blob/v1.0.28/docs/tutorial_tx_service_set_delegate.md) on how to add a new delegate.

| Params                   | Description                                                                  |
| ------------------------ | ---------------------------------------------------------------------------- |
| --contract-address       | Contract address to interact with (eg a vault or strategy)                   |
| --contract-method        | Method name for contract you wish to interact (eg unpause)                   |
| --contract-params        | Method params if needed. Review docs for examples (default: "")              |
| --implementation-address | If using a proxy, the implementation needs to be provided also (default: "") |
| --safe-address           | Gnosis safe address to propose txn to                                        |
| --network                | rinkeby mainnet etc                                                          |

Example - Set gatekeeper (rinkeby):

```bash
npx hardhat gnosis:propose-txn --safe-address 0xbac93Cf5577B0AfAcDd63d7C4a62bc5C63154606 --contract-address 0x96C0A66Fa296E72C29B3343f0DE5292665c8B4BC --contract-method setGatekeeper --contract-params '["0xE40ebF6668b7bFB2205bDc7604fa3a9AC8dBc529"]' --network rinkeby
```

Example - Unpause (rinkeby):

```bash
npx hardhat gnosis:propose-txn --safe-address 0xbac93Cf5577B0AfAcDd63d7C4a62bc5C63154606 --contract-address 0x96C0A66Fa296E72C29B3343f0DE5292665c8B4BC --contract-method unpause --network rinkeby
```

Output:

```bash
Deploying with KMS Key 2711d849-075a-4aff-97e2-f473fd22b023

>>>>>> Transaction Proposed Successfully <<<<<<<<
Response: Created
Payload: {"safe":"0xbac93Cf5577B0AfAcDd63d7C4a62bc5C63154606","contractTransactionHash":"0x0a0248631864b38a6a1998fdcd3498f7d406f5eb098ba09809e5e5b6996ff196","sender":"0xdfFB02d51375Ff9BE267FD24756d8Ab97CDc24cf","signature":"0x1f026f0aac83632fbf68bd473aebeb60fc1ae043180ec6b9d55dc084239d67a83fa60ab22bc5b788218c1ae53db6fdbed08d1cf05504e1be9e1c73de15e4cb4d1c","origin":"automation","to":"0x96C0A66Fa296E72C29B3343f0DE5292665c8B4BC","value":"0","data":"0xfbb97956000000000000000000000000ce6f06f4281cc5313936836eb39b93a75c866c3b","operation":0,"baseGas":0,"gasPrice":0,"gasToken":"0x0000000000000000000000000000000000000000","refundReceiver":"0x0000000000000000000000000000000000000000","nonce":22,"safeTxGas":0}

Gnosis Safe UI URL: https://gnosis-safe.io/app/0xbac93Cf5577B0AfAcDd63d7C4a62bc5C63154606/transactions/queue
```
