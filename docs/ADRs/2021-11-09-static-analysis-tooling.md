# CiCd Static Analysis

## Author: Michał Ogrodniczak

## Problem Statement

We should utilize static analysis tools for analysis and testing of our smart contracts. Static Analysis will help us detect issues with our code.

## Proposed Solution

There is no single clear winner tool at the moment, and therefore I suggest progressively adding a number of tools to run the analysis.
My suggestion is to get started with MyThx if we want to spend money now, next would be slither followed by Echidna.

Tooling commonly used for security:

- Static analysis using AST (abstract syntax tree) - checks fo syntax, calls issues etc
- Fuzzers - Automated software testing technique that involves providing invalid, unexpected, or random data as inputs to a computer program.
-

- [mythx.io](https://mythx.io/plans/)
  - pros:
    - easiest to integrate
    - build by Conensys
  - cons:
    - SaaS - remote analysis
    - price - $249 per month or $2499 per year (2 months savings).
- [crytic/slither](https://github.com/crytic/slither)
  - pros:
    - free, open source
    - created by security research consulting firm [trailofbits](https://www.trailofbits.com/about)
    - 74 detections - optimization and security
    - multiple printers e.g. human readable contract summary, call-graph, functions summary etc
    - trailofbits is using their tooling to claim bounties on real projects [/slither/trophies.md](https://github.com/crytic/slither/blob/master/trophies.md)
  - cons:
    - python based
    - learning curve into all options
    - requires flattened contracts
- [crytic/echidna](https://github.com/crytic/echidna)
  - pros:
    - free, open source
    - build on slither
    - fuzzer tester
    - used by multiple projects [crytic/echidna#projects-using-echidna](https://github.com/crytic/echidna#projects-using-echidna)
  - cons:
    - learning curve
    - integration costs, Echidna requires test files and/or configs for each file

## Alternative Solutions

I didnt find viable alternatives, three options presented here seem to have most usage.

[consensys/scribble](https://consensys.net/diligence/scribble/) is also worth considering if integrating with more consensys fuzzing (not available to public yet)

## Other Considerations

We should be pulling PRs locally and analysing them using available tooling and VScode extensions:
[consensys/Solidity Visual Developer](https://marketplace.visualstudio.com/items?itemName=tintinweb.solidity-visual-auditor)

## References

[How Effective are Smart Contract Analysis Tools? Evaluating Smart Contract Static
Analysis Tools Using Bug Injection](https://arxiv.org/abs/2005.11613)
[Ethereum Security Analysis Tools: An Introduction and Comparison](https://medium.com/coinmonks/ethereum-security-analysis-tools-an-introduction-and-comparison-1096194e64d5)
[MyThx tooling](https://github.com/b-mueller/awesome-mythx-smart-contract-security-tools)
[consensys/smart-contract-best-practices/security_tools/](https://consensys.github.io/smart-contract-best-practices/security_tools/)
[consensys/tools/](https://consensys.net/diligence/tools/)
