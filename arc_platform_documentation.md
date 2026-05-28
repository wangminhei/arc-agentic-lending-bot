# ARC & Circle Platform Documentation Compilation

Tài liệu tổng hợp về hệ sinh thái Arc và Circle, bao gồm các thành phần cốt lõi như AppKit, CCTP, Circle Gateway, RPC endpoints, phí gas, và các layer kỹ thuật.

*Thời gian cập nhật: 5/25/2026*

---

## AI Skills
**Nguồn:** [https://docs.arc.io/ai/skills](https://docs.arc.io/ai/skills)

Title: Live Content

Description: Fetched live

Source: https://docs.arc.io/ai/skills

---

Skip to main content

## Documentation Index

Fetch the complete documentation index at:  https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.
Skills give AI coding tools specialized knowledge for building on Arc and with
Circle’s products, including USDC, agent wallets, crosschain transfers, and
smart contracts.
Skills are available in the
circlefin/skills  repository.

##   ​
Installation

Install Circle Skills with the command-line.
Claude Code       Vercel Skills CLI                                    /plugin   marketplace   add   circlefin/skills
/plugin   install   circle-skills@circle

##   ​         Available skills

|
Skill | What it covers
|   use-arc   | Chain config, contract deployment, viem/wagmi integration, bridging via CCTP
|   use-circle-cli   | Unified CLI for agent wallets, x402 payments, and crosschain transfers
|   use-agent-wallet   | Email/OTP login, wallet creation, status checks, balance inspection
|   fund-agent-wallet   | Fund with USDC via fiat on-ramp, crypto transfer, or Gateway deposit
|   agent-wallet-policy   | View and reset per-tx, daily, weekly, and monthly USDC spending caps
|   pay-via-agent-wallet   | Pay paid APIs in USDC via x402 (search, market data, weather, news, sports)
|   use-usdc   | Balances, transfers, approvals, verification across EVM and Solana
|   bridge-stablecoin   | CCTP bridging with App Kit, progress tracking, EVM and Solana
|   swap-tokens   | Same-chain swaps via App Kit or Swap Kit; combine with bridge for crosschain
|   use-gateway   | Gateway unified balance for sub-500ms crosschain transfers
|   unify-balance   | Crosschain USDC balance via App Kit or Unified Balance Kit
|   use-circle-wallets   | Choose between developer-controlled, user-controlled, and modular wallets
|   use-developer-controlled-wallets   | Custodial wallets for payouts, treasury, subscriptions, automation
|   use-user-controlled-wallets   | Embedded wallets with social login or OTP/PIN, no seed phrases
|   use-modular-wallets   | Passkey auth and gasless transactions; ERC-4337 and ERC-6900
|   use-smart-contract-platform   | Deploy/import/call/monitor contracts; ERC-20/721/1155 templates        Was this page helpful?
Yes        No               Deploy on Arc    MCP server               ⌘ I

---

## AppKit Overview
**Nguồn:** [https://docs.arc.io/app-kit](https://docs.arc.io/app-kit)

Title: Live Content

Description: Fetched live

Source: https://docs.arc.io/app-kit

---

-    Skip to main content

## Documentation Index

Fetch the complete documentation index at:  https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.
App Kits is a suite of SDKs for composing multichain payment and liquidity flows
without orchestrating separate, low-level protocol integrations for each
blockchain or use case.
The App Kit SDK is the all-in-one core package. Install it to access every
capability — Send, Bridge, Swap, and Unified Balance — behind one type-safe
interface. Or, you can install Bridge Kit, Swap Kit, or Unified Balance Kit
separately.

##   ​
Quick install

To get started quickly, install the App Kit SDK and the Viem adapter:
npm      yarn                                    npm   install   @circle-fin/app-kit   @circle-fin/adapter-viem-v2   viem

Need a different adapter or individual kits? See the full
installation  guide.

##   ​         Core capabilities

Combine and use any of the App Kit SDK’s built-in core capabilities in your app.
Bridge, Swap, and Unified Balance are also available as individual kits.

## Bridge
Transfer USDC across blockchains.

## Swap
Exchange one token for another on the same blockchain.

## Send
Transfer tokens between wallets on the same blockchain.

## Unified Balance
Create a chain-abstracted balance and spend it instantly.

##   ​         Key benefits

Simple setup : Get up and running with minimal configuration and a few
lines of code.

-  Application monetization : Collect a custom fee from end users without
writing new code.

-  Flexible configurations : Specify custom RPC endpoints and wallet clients.

-  Broad compatibility : Works with Viem, Ethers, Solana, and Circle Wallets,
integrating smoothly with existing developer workflows.

-  Protocol abstraction : Build against a single interface over underlying
protocols such as  Gateway  and
CCTP .

-  Composable workflows : Combine multiple capabilities in one product flow
without stitching together separate protocol integrations.
Was this page helpful?
Yes        No               Agentic economy    Installation               ⌘ I

---

## Gas & Fees
**Nguồn:** [https://docs.arc.io/arc/references/gas-and-fees](https://docs.arc.io/arc/references/gas-and-fees)

Title: Live Content

Description: Fetched live

Source: https://docs.arc.io/arc/references/gas-and-fees

---

Skip to main content

## Documentation Index

Fetch the complete documentation index at:  https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.
Arc denominates all transaction fees in
USDC , the native gas token. The fee
market uses an  EIP-1559  pricing model
combined with exponentially weighted moving average (EWMA) smoothing — a
technique that calculates the base fee from a weighted running average of recent
block utilization, giving more weight to recent blocks and less to older ones.
This produces stable, predictable gas costs.
For the mechanism design behind these parameters, see
Stable fee design .

##   ​
Fee parameters

|
Parameter | Value | Notes
|  Gas unit  | USDC (18 decimals) | Native gas accounting precision
|  Pricing model  | EIP-1559 + EWMA smoothing | Replaces per-block recalculation with a moving average
|  Base fee target  | ~$0.01 per transaction | Design-time target under normal load
|  Minimum base fee (testnet)  | 20 Gwei | Floor enforced by the protocol
|  Maximum base fee  | 1e-3 USDC (~$0.001 per gas unit) | Hard ceiling that bounds worst-case cost
|  Gas throughput  | 20 M gas/sec | Protocol-level capacity limit
|  Smoothing method  | EWMA of block utilization | Short spikes do not propagate into sudden fee jumps
The EWMA smoothing window calculates each new base fee as a weighted blend of
the previous base fee and the latest block’s gas utilization ratio. Because
older blocks carry exponentially decreasing weight, short traffic spikes raise
the fee only slightly, and the base fee returns to its target quickly once
utilization normalizes.
The 18-decimal precision listed above applies to Arc’s native gas accounting.
USDC on Arc also provides a standard  ERC-20 interface with 6
decimals  for
application-level transfers and balance display. These are not two separate
tokens — they share the same underlying balance. See  Contract
addresses  for the ERC-20 address.

##   ​         Submitting transactions

Follow these practices to ensure timely transaction inclusion on Arc.

###   ​         Set an adequate max fee

Set  maxFeePerGas  to at least  20 Gwei . Transactions submitted below this
floor may remain pending indefinitely or fail outright.
import   {   ethers   }   from   "ethers"  ;

const   provider   =   new   ethers  .  JsonRpcProvider  (  "https://rpc.testnet.arc.network"  );
const   wallet   =   new   ethers  .  Wallet  (  process  .  env  .  PRIVATE_KEY  ,   provider  );

const   tx   =   await   wallet  .  sendTransaction  ({
to:   recipient  ,
value:   ethers  .  parseUnits  (  "1"  ,   6  ),   // 1 USDC via native send
maxFeePerGas:   ethers  .  parseUnits  (  "20"  ,   "gwei"  ),
});

Set  maxPriorityFeePerGas  (the EIP-1559 tip) to incentivize sequencer
inclusion. A value of  0 Gwei  is accepted, but a small tip (for example,  1
Gwei ) can improve inclusion time during high-utilization periods.

###   ​         Fetch the current base fee

Query the Arc RPC before submitting to get the latest fee data. Two standard
methods are available:
|
Method | Returns | Use case
|  eth_gasPrice  | Suggested gas price as a single value | Quick estimation for simple transactions
|  eth_feeHistory  | Base fee and priority fee history over recent blocks | Fine-grained estimation when you need historical context
import   {   ethers   }   from   "ethers"  ;

const   provider   =   new   ethers  .  JsonRpcProvider  (  "https://rpc.testnet.arc.network"  );

// Fetch current gas price
// Returns: hex string (e.g., "0x4a817c800" = 20 Gwei)
const   gasPrice  :   string   =   await   provider  .  send  (  "eth_gasPrice"  , []);

// Fetch fee history for the last 5 blocks
// Returns: { baseFeePerGas: string[], gasUsedRatio: number[], reward: string[][] }
const   feeHistory   =   await   provider  .  send  (  "eth_feeHistory"  , [
"0x5"  ,   // block count
"latest"  ,   // newest block
[  25  ,   50  ,   75  ],   // percentiles
]);

###   ​         Display fees in USDC

Because Arc denominates gas in USDC, surface fee estimates to users in dollar
terms rather than raw Gwei. This avoids confusion and aligns with the
stablecoin-native model.

##   ​         Common errors

|
Error | Cause | Resolution
|  transaction underpriced  |  maxFeePerGas  is below the 20 Gwei minimum base fee floor | Increase  maxFeePerGas  to at least  ethers.parseUnits("20", "gwei")  and resubmit
|  intrinsic gas too low  | Gas limit is lower than the intrinsic cost of the transaction | Set the gas limit to at least 21,000 for simple transfers; use  eth_estimateGas  for contract calls
|  insufficient funds for gas * price + value  | The sending account’s USDC balance cannot cover both the transfer value and the gas fee | Fund the account with enough USDC to cover the total cost (value + maxFeePerGas x gasLimit)

##   ​         Monitoring

View real-time gas metrics and recent averages using the
Arc Gas Tracker . The tracker displays
current base fee, historical trends, and per-block utilization.
The parameters on this page reflect the current Arc Testnet configuration.
Values such as the minimum base fee, maximum base fee, and throughput limits
may change before mainnet launch.       Was this page helpful?
Yes        No               Execution layer    Contract addresses               ⌘ I

---

## Contract Addresses
**Nguồn:** [https://docs.arc.io/arc/references/contract-addresses](https://docs.arc.io/arc/references/contract-addresses)

Title: Live Content

Description: Fetched live

Source: https://docs.arc.io/arc/references/contract-addresses

---

-    Skip to main content

## Documentation Index

Fetch the complete documentation index at:  https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.

All addresses on this page are for  Arc Testnet . Mainnet addresses are not
yet available.

##   ​         Stablecoins

Stablecoins are the foundation of the Arc ecosystem, supporting a growing set of
fiat-backed and yield-bearing tokens. These assets provide price stability,
onchain yield, and multi-currency support for payments, FX, and financial
applications. The ERC-20 functions affect native balance movements.

###   ​         USDC

USDC is the native EVM asset on Arc and is used for gas fees. An optional ERC-20
interface is also available for developers who need features such as
transferFrom ,  approve , and allowance management. See
Stablecoin native model  for details on
how the native and ERC-20 interfaces share the same underlying balance.
|
Contract | Address | Notes
|  USDC  |   0x3600000000000000000000000000000000000000   | Optional ERC-20 interface for interacting with the native USDC balance. Uses 6 decimals.
Getting testnet USDC:  You can request USDC on Arc Testnet from the
Circle Faucet . USDC is required to pay for gas and
interact with contracts on Arc.   Note:  As with any ERC-20 token, always use the  decimals()  function to
interpret balances and transfer amounts accurately. On Arc, the  native USDC
gas token  uses 18 decimals of precision, while the  USDC ERC-20 interface
uses 6 decimals. Avoid mixing these values directly, as doing so may result in
incorrect balance handling. For applications integrating USDC, it’s recommended
to rely solely on the standard ERC-20 interface for reading balances and sending
transfers.

###   ​         EURC

EURC is the euro-denominated stablecoin issued by Circle and supported natively
on Arc for use in payments, FX, and other financial applications.
|
Contract | Address | Notes
|  EURC  |   0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a   | Main EURC token contract. Uses 6 decimals.
Getting testnet EURC:  Testnet EURC can be requested from the  Circle
Faucet . Select  Arc Testnet  as the network and
EURC  as the token to receive a small test allocation.

###   ​         USYC

USYC  is a yield-bearing
token issued by Circle International Bermuda Ltd. and supported on Arc for
institutional and DeFi use cases. It represents shares of a tokenized money
market fund backed by short-duration U.S. Treasury securities, offering onchain
access to regulated, low-risk yield.
USYC is only accessible to institutions outside the United States, subject to
eligibility restrictions and a $100,000 USD minimum investment. See
USYC Document Certification Requirements
for more information.
|
Contract | Address | Notes
|  USYC  |   0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C   | The main USYC token contract representing tokenized money market fund shares. Uses 6 decimals.
|  Entitlements  |   0xcc205224862c7641930c87679e98999d23c26113   | Manages allowlisted access and entitlement controls for permissioned addresses on the Arc Testnet.
|  Teller  |   0x9fdF14c5B14173D74C08Af27AebFf39240dC105A   | Contract used to mint and redeem testnet USYC from testnet USDC once your wallet is allowlisted.
Getting testnet USYC:
Obtain testnet USDC from the  Circle Faucet .

- Request allowlisting by opening a ticket with
Circle Support  and include your Arc Testnet
wallet address. Requests are typically processed in 24–48 hours.

- Once approved, call the USYC Teller contract or interact with the
USYC Portal  to deposit testnet USDC and
receive testnet USYC.
For more information on issuance, redemption, and eligibility, see
USYC Overview .

##   ​         Crosschain

The contracts below enable crosschain interoperability between Arc and other
blockchains through Circle’s
Cross-Chain Transfer Protocol  (CCTP) and
Gateway . CCTP handles crosschain
message passing and stablecoin transfers, while Gateway provides
chain-abstracted USDC balances for seamless liquidity movement.

###   ​         CCTP

|
Contract | Domain | Address
|  TokenMessengerV2  | 26 |   0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA
|  MessageTransmitterV2  | 26 |   0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275
|  TokenMinterV2  | 26 |   0xb43db544E2c27092c107639Ad201b3dEfAbcF192
|  MessageV2  | 26 |   0xbaC0179bB358A8936169a63408C8481D582390C4

###   ​         Gateway

|
Contract | Domain | Address
|  GatewayWallet  | 26 |   0x0077777d7EBA4688BDeF3E311b846F25870A19B9
|  GatewayMinter  | 26 |   0x0022222ABE238Cc2C7Bb1f21003F0a260052475B

##   ​         Payments and settlement

Arc provides payment and settlement contracts that enable foreign exchange and
onchain settlement workflows using stablecoins. These components support
application-level use cases such as FX execution and escrow-based settlement.

###   ​         StableFX

StableFX  is an enterprise-grade
stablecoin FX engine that combines Request-for-Quote (RFQ) execution with
onchain settlement on Arc. The following is the address for the escrow contract
used to settle stablecoin swaps.
|
Contract | Address | Notes
|  FxEscrow  |   0x867650F5eAe8df91445971f14d89fd84F0C9a9f8   | The escrow contract used by both makers and takers to settle stablecoin swaps.
Before executing FX trades, StableFX must be able to transfer USDC from your
wallet. To enable this, you need to grant a USDC allowance to the Permit2
contract. See  Common Ethereum contracts  for the
Permit2 address.

##   ​         Common Ethereum contracts

Arc Testnet includes a set of widely used Ethereum ecosystem contracts for
deterministic deployment, batched reads, and standardized token approvals.
Although not Circle-managed, these contracts are deployed on Arc to ensure
compatibility with common EVM tooling and workflows.
|
Contract | Address | Notes
|  CREATE2 Factory (Arachnid)  |   0x4e59b44847b379578588920cA78FbF26c0B4956C   | Minimal proxy for deterministic contract deployment using the  CREATE2  opcode.
|  Multicall3  |   0xcA11bde05977b3631167028862bE2a173976CA11   | Aggregates multiple read calls into a single call for efficient data retrieval.
|  Permit2  |   0x000000000022D473030F116dDEE9F6B43aC78BA3   | Universal contract for signature-based token approvals. Required for StableFX.        Was this page helpful?
Yes        No               Gas and fees    RPC endpoints               ⌘ I

---

## RPC Endpoints
**Nguồn:** [https://docs.arc.io/arc/references/rpc-endpoints](https://docs.arc.io/arc/references/rpc-endpoints)

Title: Live Content

Description: Fetched live

Source: https://docs.arc.io/arc/references/rpc-endpoints

---

Skip to main content

## Documentation Index

Fetch the complete documentation index at:  https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.
Arc exposes standard Ethereum JSON-RPC endpoints — the same HTTP and WebSocket
API that Ethereum nodes use — for submitting transactions, querying state, and
subscribing to events. Connect through Circle’s primary endpoint or through a
third-party node provider . For details on Arc’s current
network phase, see  Deployment model .

##   ​
Testnet endpoints

|
Provider | HTTP | WebSocket
|  Primary (Circle)  |  https://rpc.testnet.arc.network  |  wss://rpc.testnet.arc.network
|  Blockdaemon  |  https://rpc.blockdaemon.testnet.arc.network  | —
|  dRPC  |  https://rpc.drpc.testnet.arc.network  |  wss://rpc.drpc.testnet.arc.network
|  QuickNode  |  https://rpc.quicknode.testnet.arc.network  |  wss://rpc.quicknode.testnet.arc.network

##   ​         Network parameters

These parameters identify the Arc Testnet on the Ethereum network and are
required when adding Arc to a wallet or development framework.
|
Parameter | Value
|  Chain ID  |  5042002
|  Currency symbol  | USDC
|  Block explorer  |  testnet.arcscan.app
|  Gas tracker  |  testnet.arcscan.app/gas-tracker
|  Faucet  |  faucet.circle.com
For an overview of network phases, see
Deployment model . For wallet configuration
instructions using these parameters, see
Connect to Arc .

##   ​         Node providers

The following infrastructure partners offer managed RPC access to Arc. Each
provider supports HTTP endpoints, and most support WebSocket connections. See
Node providers  for additional details.
|
Provider | Description
|   Alchemy   | Developer platform with enhanced APIs, monitoring, and debugging tools
|   Blockdaemon   | Institutional-grade node infrastructure with secure, compliant access
|   dRPC   | Decentralized RPC aggregator with load-balanced, multi-provider routing
|   QuickNode   | High-performance global endpoints and blockchain APIs

##   ​         Supported methods

Arc supports all standard Ethereum JSON-RPC methods. The table below lists
commonly used methods by category.
|
Category | Methods | Notes
|  State  |  eth_getBalance ,  eth_getCode ,  eth_getStorageAt ,  eth_call  |
|  Transactions  |  eth_sendRawTransaction ,  eth_getTransactionReceipt ,  eth_getTransactionByHash  |
|  Blocks  |  eth_getBlockByNumber ,  eth_getBlockByHash ,  eth_blockNumber  |
|  Gas  |  eth_gasPrice ,  eth_estimateGas ,  eth_feeHistory  |
|  Subscriptions  |  eth_subscribe ,  eth_unsubscribe  | WebSocket only
For gas fee parameters and best practices for setting  maxFeePerGas , see
Gas and fees .
The values on this page apply to the Arc Testnet. Mainnet endpoints and
parameters are published separately when available.

##   ​         Troubleshooting

|
Symptom | Cause | Resolution
|  connection refused  or timeout | Incorrect RPC URL or network issue | Verify you are using a URL from the  testnet endpoints  table. Try an alternate provider.
|  invalid chain id  | Wallet or provider configured with the wrong Chain ID | Set the Chain ID to  5042002 .
|  insufficient funds  | Account has no USDC for gas | Request testnet USDC from the  faucet .        Was this page helpful?
Yes        No               Contract addresses    Deployment model               ⌘ I

---

## Execution Layer
**Nguồn:** [https://docs.arc.io/arc/concepts/execution-layer](https://docs.arc.io/arc/concepts/execution-layer)

Title: Live Content

Description: Fetched live

Source: https://docs.arc.io/arc/concepts/execution-layer

---

-    Skip to main content

## Documentation Index

Fetch the complete documentation index at:  https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.
Arc’s execution layer is built on  Reth , a
Rust implementation of the Ethereum execution client. Reth maintains the full
blockchain state, executes every transaction through the Ethereum Virtual
Machine (EVM), and produces the state root — a cryptographic hash that
summarizes the entire ledger state — that the
consensus layer  finalizes. Arc extends this
foundation with modules purpose-built for stablecoin-native finance.

##   ​
What Reth does

Reth handles three jobs on every block:

Maintains the ledger.  Tracks accounts, balances, smart contracts, and
transaction history. Every state change is recorded and addressable.

-  Executes transactions.  Applies EVM logic for smart contract calls and
transfers, deducts gas fees through the Fee Manager, and routes through
Arc-specific modules where applicable.

-  Produces the state root.  Computes a Merkle root — a single hash derived
from a tree of all state data — of the updated state after all transactions
in a block have been applied. The consensus layer finalizes this root, making
the block irreversible.

Reth is written in Rust for performance, memory safety, and modular
extensibility. Arc leverages this architecture to plug in stablecoin-native
modules without modifying core EVM execution.

##   ​         Arc-specific extensions

Arc extends the standard Ethereum execution pipeline with modules that run
alongside core EVM logic at the protocol level — meaning they are built into
the blockchain itself, not deployed as user-space smart contracts. You benefit
from these capabilities without deploying custom contracts or external services.
|
Extension | Status | Function
|   Fee Manager   | Live | Stabilizes gas fees using USDC as the unit of account with EWMA smoothing.
|   CallFrom precompile   | Live | Preserves  msg.sender  across delegated calls, powering the Memo and Multicall3From contracts.
|   ArcaneVM   | Planned | Confidential execution environment for Solidity contracts, composing synchronously with the public EVM.
|  Stablecoin Services  | Planned | Powers crosscurrency settlement, paymaster-sponsored transactions, and multi-stablecoin gas payments.

###   ​         Fee Manager

The Fee Manager replaces Ethereum’s per-block EIP-1559 base fee recalculation
with an EWMA-smoothed fee curve denominated in USDC. Short demand spikes are
absorbed by the smoothing window rather than propagated into sudden fee jumps.
The base fee targets approximately $0.01 per transaction under normal
conditions.
For the full fee model, see
stable fee design . For runtime parameters,
see  gas and fees .

###   ​         CallFrom precompile

Standard Ethereum opcodes  CALL  and  DELEGATECALL  — used when one contract
invokes another — change  msg.sender  (the address of the immediate caller) at
each hop in the call chain. The CallFrom precompile preserves the original
caller’s address through the call chain. Two predeployed contracts use this
precompile:

-  Memo  ( 0x9702... ) — Attaches memo metadata to contract calls and emits
indexed  Memo  events.

-  Multicall3From  ( 0xEb7c... ) — Batches multiple calls like Multicall3,
but each subcall retains the original  msg.sender .

For contract addresses and integration details, see
transaction extensions .
For how this differs from standard Ethereum behavior, see
EVM compatibility .

##   ​         Protocol precompiles

Arc exposes five custom precompiles in the  0x1800..  address range — shorthand
for the addresses  0x1800000000000000000000000000000000000000  through
0x1800000000000000000000000000000000000004 . These are built into the execution
layer at the protocol level rather than deployed as user-space contracts, and
they back the protocol-level features listed above.
|
Precompile | Address | Function
|  Native Coin Authority  |  0x1800..0000  | Mint, burn, and transfer operations for the native USDC balance.
|  Native Coin Control  |  0x1800..0001  | Address blocklist for the native coin.
|  System Accounting  |  0x1800..0002  | Gas fee ring buffer used by the Fee Manager.
|  Call From  |  0x1800..0003  | Powers the Memo and Multicall3From contracts described above.
|  PQ Signature Verify  |  0x1800..0004  | Post-quantum  SLH-DSA-SHA2-128s  signature verification.
You typically interact with these precompiles indirectly through the predeployed
contracts and protocol features they support, rather than calling them directly.

###   ​         ArcaneVM

ArcaneVM is on the roadmap and not yet available on Arc.
ArcaneVM is a confidential execution environment for Solidity contracts that
runs alongside Arc’s public EVM. Contracts deployed to ArcaneVM keep state and
transaction data confidential while finalizing in the same block as public
state, under default-deny contract isolation. See
opt-in privacy  for the planned design.

###   ​         Stablecoin Services

Stablecoin Services are on the roadmap and not yet available on Arc.
Stablecoin Services will provide crosscurrency settlement, paymaster-sponsored
transactions, and multi-stablecoin gas payments at the protocol level. See
stablecoin native model  for the design
rationale.

##   ​         Execution pipeline

A transaction moves through the execution layer in a linear pipeline. Reth
applies each transaction to the current state and produces a new state root,
which the consensus layer then finalizes into an irreversible block.

-  Mempool.  Pending transactions wait in the mempool (a holding area for
unconfirmed transactions) after passing initial validation (valid signature,
sufficient balance, proper nonce).

-  EVM execution.  Reth applies each transaction sequentially, running smart
contract bytecode and processing native transfers.

-  Fee Manager.  Gas fees are deducted in USDC using the EWMA-smoothed base
fee. This step runs on every transaction.

-  Module calls.  If the transaction invokes ArcaneVM or Stablecoin Services
functionality, the relevant module processes the call. Standard transactions
skip this step.

-  State update.  Reth writes the resulting changes (account balances,
contract storage, event logs) to the state database.

-  State root.  Reth computes a Merkle root over the full updated state. This
root serves as a cryptographic commitment — a tamper-evident fingerprint of
the entire ledger — that the consensus layer finalizes.
Was this page helpful?
Yes        No               Consensus layer    Gas and fees               ⌘ I

---

## Consensus Layer
**Nguồn:** [https://docs.arc.io/arc/concepts/consensus-layer](https://docs.arc.io/arc/concepts/consensus-layer)

Title: Live Content

Description: Fetched live

Source: https://docs.arc.io/arc/concepts/consensus-layer

---

-    Skip to main content

## Documentation Index

Fetch the complete documentation index at:  https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.
Arc’s consensus layer is built on
Malachite , a high-performance,
open-source implementation of the Tendermint Byzantine Fault Tolerant (BFT)
protocol. BFT consensus ensures the network reaches agreement on a single
history of transactions even if some validators behave maliciously or go
offline. Arc uses a Proof-of-Authority (PoA) validator set to order
transactions, produce blocks, and deliver
deterministic finality  — the guarantee
that committed blocks are permanent and can never be reversed or reorganized —
in under one second.

##   ​
How Malachite consensus works

For how this fits into the broader architecture, see the
system overview .
Each block passes through a four-step pipeline. A rotating proposer assembles
transactions, and all validators participate in two rounds of voting before the
block is committed.

Propose  — A validator selected as proposer for the current round bundles
pending transactions into a block and broadcasts it.

-  Pre-vote  — Every validator evaluates the proposed block and broadcasts a
vote on its validity.

-  Pre-commit  — Validators broadcast a second vote. If more than two-thirds
of validators pre-commit to the same block, it proceeds to commit.

-  Commit  — The block is finalized and appended to the chain. Every
transaction in the block is irreversible.

This two-phase voting process (pre-vote + pre-commit) guarantees that two
conflicting blocks can never both be finalized, making reorganizations
impossible.

##   ​         Proof-of-Authority validator set

Arc uses a  permissioned Proof-of-Authority (PoA)  model instead of anonymous
economic staking. Validators are selected, known institutions with compliance
obligations and operational guarantees.
For details on operating a validator node, see
running a node .

-  SOC 2 certified  — Validators meet audited security and availability
standards.

-  Geographic distribution  — Nodes run across multiple global regions to
reduce correlated downtime.

-  Rotating proposer  — Block production rotates among validators to ensure
fairness and liveness.

-  Uptime SLAs  — Each validator commits to operational availability
requirements.

This design replaces anonymous economic incentives with institutional
accountability, providing stronger assurances for regulated finance.

##   ​         Performance characteristics

Performance also depends on the
execution layer , which processes transactions
within each block.
Malachite delivers optimistic responsiveness: blocks are produced as fast as the
network permits, with no artificial delays or extra timeouts.
|
Metric | Value | Conditions
| Throughput | 3,000+ TPS | 20 globally distributed validators
| Finality | <350 ms | Benchmark conditions
| Peak throughput | 10,000+ TPS | 4 validators

##   ​         Security guarantees

Arc combines protocol-level safety with institutional safeguards:
|
Guarantee | Description
| Safety | With fewer than one-third faulty validators, consensus guarantees that no conflicting blocks are finalized.
| Liveness | The network continues to produce blocks as long as two-thirds or more of validators are online and honest.
| Accountability | Validators are regulated institutions, making malicious behavior costly beyond protocol penalties.
| Resilience | Geographic distribution reduces the risk of correlated outages or targeted attacks.
The  deployment model  provides additional
detail on how validators are geographically distributed.

##   ​         Roadmap

The Malachite roadmap includes multi-proposer support (multiple validators
propose blocks in parallel for higher throughput), a protocol optimization that
reduces consensus from three rounds to two for lower latency, and a potential
transition from Proof-of-Authority to permissioned Proof-of-Stake to broaden
validator participation while maintaining compliance requirements.     Was this page helpful?
Yes        No               System overview    Execution layer               ⌘ I

---

## Circle Gateway
**Nguồn:** [https://developers.circle.com/gateway](https://developers.circle.com/gateway)

Title: Live Content

Description: Fetched live

Source: https://developers.circle.com/gateway

---

Skip to main content

## Documentation Index

Fetch the complete documentation index at:  https://developers.circle.com/llms.txt

Use this file to discover all available pages before exploring further.
Circle Gateway enables a unified USDC balance across multiple blockchains.
Deposit USDC to non-custodial Gateway Wallet contracts on any supported source
blockchain, then mint USDC instantly (<500 ms) on any destination blockchain
using a single API call.
Gateway is fully permissionless, and you can start integrating with it
immediately with no sign-up needed. Check out the quickstart guides for
EVM  and
Solana .

Use
Unified Balance Kit
to simplify Gateway integrations.   Unified Balance Kit handles deposit, transfer, and spend flows so you can build
Gateway-powered features in just a few lines of code.

##   ​         Key features

## Unified crosschain balance
Hold USDC across multiple blockchains and access it as a single balance on
any supported destination blockchain

## Instant transfers
Transfer USDC in under 500 ms after your balance is established, with no
waiting for source blockchain finality

## Non-custodial
Retain full ownership of deposited USDC with signature-based authorization
and a 7-day trustless withdrawal option

##   ​         What you can build

Gateway enables applications that require instant access to USDC across
blockchains. Here are some common use cases:
Chain abstraction
Build applications where users interact with USDC without worrying about which
blockchain it’s on. Users deposit once and access their balance instantly on any
supported blockchain.
Crosschain liquidity
Provide instant liquidity across blockchains without maintaining separate
balances on each chain. Consolidate USDC holdings and access them where needed.
Payment routing
Route payments to any supported blockchain instantly. Accept USDC on one
blockchain and settle on another without delays.
Treasury management
Reduce working capital requirements by consolidating USDC across blockchains
into a unified balance that’s accessible anywhere.
Agentic commerce
Power AI agents and machine-to-machine systems with gasless, sub-cent USDC
payments. See  Agent Nanopayments  for the
agent-builder workflow.

##   ​
Get started

## Create and transfer a unified balance
Build a script to deposit USDC on multiple blockchains and transfer it
instantly to a destination blockchain

## Set up webhooks
Receive real-time notifications for Gateway events on your registered wallet
addresses

## Supported blockchains
View the blockchains where you can deposit and mint USDC with Gateway

##   ​         Related products

CCTP and Gateway offer different approaches to crosschain transfers. This table
compares the two approaches.
|
Attribute | CCTP | Gateway
|  Use case  | Transfer USDC from one blockchain to another | Hold a unified USDC balance accessible on any supported blockchain
|  Transfer speed  | Fast Transfer: ~8-20 seconds Standard Transfer: 15-19 minutes (Ethereum/L2s) | Instant (<500 ms) after balance is established
|  Balance model  | Point-to-point transfers | Unified crosschain balance
|  Custody  | Non-custodial | Non-custodial with 7-day trustless withdrawal option
|  Supported blockchains  |  View list  |  View list         Was this page helpful?
Yes        No            CCTP Chain Domains V1       Previous       Gateway Supported Blockchains       Next             ⌘ I                                   Assistant                               Responses are generated using AI and may contain mistakes.

---

## CCTP
**Nguồn:** [https://developers.circle.com/cctp](https://developers.circle.com/cctp)

Title: Live Content

Description: Fetched live

Source: https://developers.circle.com/cctp

---

Skip to main content

## Documentation Index

Fetch the complete documentation index at:  https://developers.circle.com/llms.txt

Use this file to discover all available pages before exploring further.
Cross-Chain Transfer Protocol (CCTP) is a permissionless onchain utility that
facilitates native USDC transfers across blockchains. CCTP burns USDC on the
source blockchain and mints it on the destination blockchain, enabling secure
1:1 transfers without traditional bridge liquidity pools or wrapped tokens.

Use  Bridge Kit  to
simplify crosschain transfers with CCTP.   Bridge Kit is a lightweight SDK that uses CCTP as its protocol provider, letting
you transfer USDC between blockchains in just a few lines of code.

##   ​         Key features

## Native USDC transfers
Transfer native USDC across blockchains without wrapped tokens or liquidity
pools

## Configurable transfer speeds
Choose between  Fast
Transfer
for speed or  Standard
Transfer
for cost efficiency

## Programmable hooks
Trigger automated actions on the destination blockchain after USDC arrives

##   ​         What you can build

CCTP enables you to build applications that require moving USDC across
blockchains. Here are some common use cases:
Crosschain liquidity management
Rebalance USDC holdings across blockchains to meet liquidity demands, manage
treasury positions, or take advantage of market opportunities with minimal
latency.
Crosschain swaps
Enable users to swap tokens on one blockchain for tokens on another blockchain
by routing through USDC. Build seamless crosschain trading experiences that feel
like a single transaction.
Crosschain payments
Accept USDC payments on one blockchain and automatically transfer funds to
another blockchain where your business operations are based or where recipients
prefer to receive funds.
Composable crosschain applications
Use CCTP hooks to chain together crosschain actions. Transfer USDC across
blockchains and automatically deposit it into DeFi protocols, purchase NFTs, or
execute smart contract logic.

##   ​
Get started

## Transfer USDC from Ethereum to Arc
Build a script to transfer USDC between EVM blockchains using CCTP

## Transfer USDC from Solana to Arc
Transfer USDC from Solana to an EVM blockchain using CCTP

## Transfer USDC to and from Stellar
Transfer USDC between Arc and Stellar using CCTP

##   ​         Related products

CCTP and Gateway offer different approaches to crosschain transfers. This table
compares the two approaches.
|
Attribute | CCTP | Gateway
|  Use case  | Transfer USDC from one blockchain to another | Hold a unified USDC balance accessible on any supported blockchain
|  Transfer speed  | Fast Transfer: ~8-20 seconds Standard Transfer: 15-19 minutes (Ethereum/L2s) | Instant (<500 ms) after balance is established
|  Balance model  | Point-to-point transfers | Unified crosschain balance
|  Custody  | Non-custodial | Non-custodial with 7-day trustless withdrawal option
|  Supported blockchains  |  View list  |  View list         Was this page helpful?
Yes        No            Crosschain Transfers       Previous       Supported Blockchains and Domains       Next             ⌘ I                                   Assistant                               Responses are generated using AI and may contain mistakes.

---

