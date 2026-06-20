/**
 * task-executor.ts
 * Thực thi các task definitions từ tasks/tasks-worker-01.json
 */

import {
  createPublicClient,
  http,
  keccak256,
  toHex,
  formatUnits,
  parseUnits,
  encodeFunctionData,
  type Address,
} from "viem";
import { arcTestnet } from "viem/chains";
import { WalletManager, type WalletPair } from "./wallet-manager.js";
import { PaymentHandler } from "./payment-handler.js";
import { Logger } from "./logger.js";
import fs from "fs";
import path from "path";
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";
import crypto from "crypto";
import { GatewayClient, BatchEvmScheme } from "@circle-fin/x402-batching/client";
import { AIBrain } from "./ai-brain.js";

// Add a 30-day buffer to maxTimeoutSeconds on the client side to prevent "authorization_validity_too_short" from minor clock skews
const originalCreatePayload = BatchEvmScheme.prototype.createPaymentPayload;
BatchEvmScheme.prototype.createPaymentPayload = async function(x402Version: any, paymentRequirements: any) {
  console.log("[x402 Debug Client] createPaymentPayload called! Original maxTimeoutSeconds:", paymentRequirements.maxTimeoutSeconds);
  const modifiedRequirements = {
    ...paymentRequirements,
    maxTimeoutSeconds: (paymentRequirements.maxTimeoutSeconds || 345600) + 2592000
  };
  return originalCreatePayload.call(this, x402Version, modifiedRequirements);
};

const originalGatewayCreatePayload = GatewayClient.prototype.createPaymentPayload;
GatewayClient.prototype.createPaymentPayload = async function(x402Version: any, paymentRequirements: any) {
  console.log("[x402 Debug Gateway Client] createPaymentPayload called! Original maxTimeoutSeconds:", paymentRequirements.maxTimeoutSeconds);
  const modifiedRequirements = {
    ...paymentRequirements,
    maxTimeoutSeconds: (paymentRequirements.maxTimeoutSeconds || 345600) + 2592000
  };
  return originalGatewayCreatePayload.call(this, x402Version, modifiedRequirements);
};

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// ─── Constants ────────────────────────────────────────────────────────────────

const IDENTITY_REGISTRY  = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address;
const REPUTATION_REGISTRY= "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Address;
const USDC_CONTRACT      = "0x3600000000000000000000000000000000000000" as Address;
const EURC_CONTRACT      = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address;
const CIRBTC_CONTRACT    = "0xf0c4a4ce82a5746abaad9425360ab04fbba432bf" as Address;
const MULTICALL3         = "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const MULTICALL3_ABI = [
  {
    name: "aggregate3",
    type: "function",
    stateMutability: "view",
    inputs: [{
      name: "calls",
      type: "tuple[]",
      components: [
        { name: "target", type: "address" },
        { name: "allowFailure", type: "bool" },
        { name: "callData", type: "bytes" },
      ],
    }],
    outputs: [{
      name: "returnData",
      type: "tuple[]",
      components: [
        { name: "success", type: "bool" },
        { name: "returnData", type: "bytes" },
      ],
    }],
  },
  {
    name: "getBlockNumber",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "blockNumber", type: "uint256" }],
  },
] as const;

export const LENDING_POOL_ABI = [
  {
    name: "getAccountData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "collateralUSDC", type: "uint256" },
      { name: "collateralCirBTC", type: "uint256" },
      { name: "borrowedEURC", type: "uint256" },
      { name: "currentBtcPrice", type: "uint256" },
      { name: "totalCollateralUSD", type: "uint256" },
      { name: "maxBorrowEURC", type: "uint256" },
      { name: "healthFactor", type: "uint256" },
    ],
  },
  {
    name: "userReputation",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getUserLTV",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  name: string;
  type: string;
  description: string;
  enabled: boolean;
  schedule: string;
  priority: number;
  params: Record<string, any>;
  deliverable: { type: string; hash_content: boolean };
}

export interface TaskResult {
  taskId: string;
  taskName: string;
  taskType: string;
  status: "success" | "failed" | "skipped";
  result?: any;
  txHash?: string;
  error?: string;
  executedAt: string;
  duration_ms: number;
}

// ─── TaskExecutor Class ───────────────────────────────────────────────────────

export class TaskExecutor {
  private walletManager: WalletManager;
  private paymentHandler: PaymentHandler;
  public publicClient: ReturnType<typeof createPublicClient>;
  private logger: Logger;
  private resultsDir: string;
  private workerId: string;
  private completedOnce: Set<string> = new Set();
  private pollCount: number = 0;
  private scpClient: any;
  private aiBrain: AIBrain;

  constructor(walletManager: WalletManager, paymentHandler: PaymentHandler, workerId = "worker-01") {
    this.walletManager = walletManager;
    this.paymentHandler = paymentHandler;
    this.publicClient = walletManager.getPublicClient() as any;
    this.logger = new Logger("TaskExecutor");
    this.workerId = workerId;
    this.resultsDir = path.resolve(`./runtime/${workerId}/results`);
    fs.mkdirSync(this.resultsDir, { recursive: true });
    this.loadOnceState();

    const apiKey = process.env.CIRCLE_API_KEY!;
    const entitySecret = process.env.CIRCLE_ENTITY_SECRET!;
    this.scpClient = initiateSmartContractPlatformClient({
      apiKey,
      entitySecret,
    });
    this.aiBrain = new AIBrain();
  }

  // ── Execute single task ───────────────────────────────────────────────────

  async executeTask(task: Task, wallets: WalletPair): Promise<TaskResult> {
    const startTime = Date.now();

    if (!task.enabled) {
      return this.result(task, "skipped", {}, undefined, "Task disabled", startTime);
    }

    if (task.schedule === "once" && this.completedOnce.has(task.id)) {
      this.logger.debug(`Skip once-task: ${task.id}`);
      return this.result(task, "skipped", {}, undefined, "Already executed", startTime);
    }

    // every_N_polls check - execute on the first poll of a session to verify they work, then follow the interval
    if (task.schedule.startsWith("every_") && task.schedule.endsWith("_polls")) {
      const n = parseInt(task.schedule.split("_")[1]);
      if (this.pollCount !== 1 && this.pollCount % n !== 0) {
        return this.result(task, "skipped", {}, undefined, `Poll interval not met`, startTime);
      }
    }

    this.logger.info(`Executing task: [${task.id}] ${task.name}`);

    try {
      let resultData: any;
      let txHash: string | undefined;

      switch (task.type) {
        case "data_fetch":
          resultData = await this.executeDataFetch(task);
          break;

        case "contract_interaction":
          resultData = await this.executeContractRead(task, wallets);
          break;

        case "onchain_identity": {
          const r = await this.executeIdentityRegistration(task, wallets);
          txHash = r.txHash; resultData = r;
          break;
        }

        case "payment_processing": {
          const r = await this.executeJobLifecycle(task, wallets);
          txHash = r.txHashes?.complete; resultData = r;
          break;
        }

        case "reputation_building": {
          const r = await this.executeReputationRecord(task, wallets);
          txHash = r.txHash; resultData = r;
          break;
        }

        case "usdc_transfer": {
          const r = await this.executeUSDCTransfer(task, wallets);
          txHash = r.txHash; resultData = r;
          break;
        }

        case "eurc_transfer": {
          const r = await this.executeEURCTransfer(task, wallets);
          txHash = r.txHash; resultData = r;
          break;
        }

        case "eurc_balance":
          resultData = await this.executeEURCBalance(task, wallets);
          break;

        case "cirbtc_balance":
          resultData = await this.executeCIRBTCBalance(task, wallets);
          break;

        case "cirbtc_transfer": {
          const r = await this.executeCIRBTCTransfer(task, wallets);
          txHash = r.txHash; resultData = r;
          break;
        }

        case "multicall_read":
          resultData = await this.executeMulticallRead(task, wallets);
          break;

        case "cctp_bridge": {
          const r = await this.executeCCTPBridge(task, wallets);
          txHash = r.txHash; resultData = r;
          break;
        }

        case "token_swap": {
          const r = await this.executeTokenSwap(task, wallets);
          txHash = r.txHash; resultData = r;
          break;
        }

        case "random_transfer": {
          const r = await this.executeRandomTransfer(task, wallets);
          txHash = r.txHash; resultData = r;
          break;
        }

        case "deploy_token": {
          const r = await this.executeDeployToken(task, wallets);
          txHash = r.txHash; resultData = r;
          break;
        }

        case "deploy_nft": {
          const r = await this.executeDeployNFT(task, wallets);
          txHash = r.txHash; resultData = r;
          break;
        }

        case "say_gm": {
          const r = await this.executeSayGM(task, wallets);
          txHash = r.txHash; resultData = r;
          break;
        }

        case "x402_nanopayment": {
          const r = await this.executeX402Nanopayment(task, wallets);
          txHash = r.txHash; resultData = r;
          break;
        }

        case "x402_puzzle_solver": {
          const r = await this.executeX402PuzzleSolver(task, wallets);
          txHash = r.txHash; resultData = r;
          break;
        }

        case "auto_recycle": {
          const r = await this.executeAutoRecycle(task, wallets);
          txHash = r.txHash; resultData = r;
          break;
        }

        case "lending_borrowing": {
          const r = await this.executeLendingBorrowing(task, wallets);
          txHash = r.txHash; resultData = r;
          break;
        }

        case "ai_brain_decision": {
          const r = await this.executeAIBrainDecision(task, wallets);
          txHash = r.txHash; resultData = r;
          break;
        }

        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      const rawResult = this.result(task, "success", resultData, txHash, undefined, startTime);
      // Sanitize BigInt to string to prevent JSON serialization errors
      const taskResult = JSON.parse(
        JSON.stringify(rawResult, (key, value) => (typeof value === "bigint" ? value.toString() : value))
      );
      this.saveResult(taskResult);

      if (task.schedule === "once") {
        this.completedOnce.add(task.id);
        this.saveOnceState();
      }

      this.logger.success(`Task ${task.id} done in ${taskResult.duration_ms}ms`);
      return taskResult;

    } catch (error: any) {
      this.logger.error(`Task ${task.id} failed: ${error.message}`);
      const failResult = this.result(task, "failed", {}, undefined, error.message, startTime);
      this.saveResult(failResult);
      return failResult;
    }
  }

  // ── Execute all enabled tasks ─────────────────────────────────────────────

  async executeAll(tasks: Task[], wallets: WalletPair): Promise<TaskResult[]> {
    this.pollCount++;
    const results: TaskResult[] = [];

    const sorted = [...tasks]
      .filter((t) => t.enabled && t.schedule !== "manual")
      .sort((a, b) => b.priority - a.priority);

    for (const task of sorted) {
      results.push(await this.executeTask(task, wallets));
    }
    return results;
  }

  // ── task: data_fetch ──────────────────────────────────────────────────────

  private async executeDataFetch(task: Task): Promise<any> {
    const block = await this.publicClient.getBlock();
    const blockNumber = await this.publicClient.getBlockNumber();
    const data = {
      blockNumber: blockNumber.toString(),
      blockHash: block.hash,
      timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      gasLimit: block.gasLimit.toString(),
      gasUsed: block.gasUsed.toString(),
      transactionCount: block.transactions.length,
      fetchedAt: new Date().toISOString(),
    };
    this.logger.info(`  Block #${data.blockNumber} | txs: ${data.transactionCount}`);
    return data;
  }

  // ── task: contract_interaction (USDC balance) ─────────────────────────────

  private async executeContractRead(task: Task, wallets: WalletPair): Promise<any> {
    const ownerBal = await this.walletManager.getUSDCBalance(wallets.owner.address);
    const validatorBal = await this.walletManager.getUSDCBalance(wallets.validator.address);
    this.logger.info(`  Owner: ${ownerBal.usdc} USDC | Validator: ${validatorBal.usdc} USDC`);
    return {
      owner: { address: wallets.owner.address, usdc: ownerBal.usdc },
      validator: { address: wallets.validator.address, usdc: validatorBal.usdc },
      checkedAt: new Date().toISOString(),
    };
  }

  // ── task: onchain_identity ────────────────────────────────────────────────

  private async executeIdentityRegistration(task: Task, wallets: WalletPair): Promise<any> {
    const metadataUri = task.params.metadata_uri ||
      "ipfs://bafkreibdi6623n3xpf7ymk62ckb4bo75o3qemwkpfvp5i25j66itxvsoei";
    this.logger.info(`  Registering agent identity...`);
    const txHash = await this.walletManager.executeContract(
      wallets.owner.address, IDENTITY_REGISTRY,
      "register(string)", [metadataUri], "ERC-8004 register"
    );
    return { txHash, metadataUri, ownerAddress: wallets.owner.address, registeredAt: new Date().toISOString() };
  }

  // ── task: payment_processing ──────────────────────────────────────────────

  private async executeJobLifecycle(task: Task, wallets: WalletPair): Promise<any> {
    const budgetUsdc = task.params.job_budget_usdc || 5;
    const description = task.params.job_description || `Arc Worker Bot task - ${new Date().toISOString()}`;
    const bal = await this.walletManager.getUSDCBalance(wallets.owner.address);
    if (parseFloat(bal.usdc) < budgetUsdc + 1) {
      throw new Error(`Insufficient USDC: have ${bal.usdc}, need ${budgetUsdc + 1}`);
    }
    const jobResult = await this.paymentHandler.runJobLifecycle(wallets, description, budgetUsdc);
    this.paymentHandler.printJobSummary(jobResult);
    return jobResult;
  }

  // ── task: reputation_building ─────────────────────────────────────────────

  private async executeReputationRecord(task: Task, wallets: WalletPair): Promise<any> {
    const score = task.params.score || 95;
    const tag = task.params.tag || "successful_execution";
    const feedbackHash = keccak256(toHex(tag));
    this.logger.info(`  Recording reputation: score=${score}, tag="${tag}"`);
    const txHash = await this.walletManager.executeContract(
      wallets.validator.address, REPUTATION_REGISTRY,
      "giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)",
      ["1", score.toString(), "0", tag, "", "", "", feedbackHash],
      "giveFeedback"
    );

    // Sync reputation to Multi-Collateral Pool if deployed
    let poolSyncTxHash: string | undefined;
    try {
      const contractsPath = path.resolve(`./runtime/${this.workerId}/state/contracts.json`);
      if (fs.existsSync(contractsPath)) {
        const contracts = JSON.parse(fs.readFileSync(contractsPath, "utf-8"));
        const poolAddress = contracts.multi_collateral_pool;
        if (poolAddress) {
          this.logger.info(`  [Lending Reputation Sync] Syncing reputation score ${score} to Multi-Collateral Pool...`);
          poolSyncTxHash = await this.walletManager.executeContract(
            wallets.owner.address,
            poolAddress,
            "updateReputation(address,uint256)",
            [wallets.owner.address, score.toString()],
            "Update Reputation on Pool"
          );
          this.logger.success(`  [Lending Reputation Sync] Dyn LTV updated on-chain! Tx: ${poolSyncTxHash}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`  [Lending Reputation Sync Failed] ${err.message}`);
    }

    return { txHash, poolSyncTx: poolSyncTxHash, score, tag, feedbackHash, recordedAt: new Date().toISOString() };
  }

  // ── task: usdc_transfer ───────────────────────────────────────────────────

  private async executeUSDCTransfer(task: Task, wallets: WalletPair): Promise<any> {
    const amount = task.params.amount || "1";
    const direction = task.params.direction || "owner_to_validator";
    const fromWallet = direction === "owner_to_validator" ? wallets.owner : wallets.validator;
    const toAddress  = direction === "owner_to_validator" ? wallets.validator.address : wallets.owner.address;

    this.logger.info(`  USDC transfer ${amount} USDC → ${direction.replace("_", "→")}`);

    // Check balance
    const bal = await this.walletManager.getUSDCBalance(fromWallet.address);
    if (parseFloat(bal.usdc) < parseFloat(amount) + 0.5) {
      throw new Error(`Insufficient balance: ${bal.usdc} USDC`);
    }

    const txHash = await this.walletManager.transferUSDC(
      fromWallet.id, fromWallet.address, toAddress, amount
    );
    return { txHash, amount, direction, from: fromWallet.address, to: toAddress, transferredAt: new Date().toISOString() };
  }

  // ── task: eurc_transfer ───────────────────────────────────────────────────

  private async executeEURCTransfer(task: Task, wallets: WalletPair): Promise<any> {
    const amount = task.params.amount || "1";
    const direction = task.params.direction || "owner_to_validator";
    const fromWallet = direction === "owner_to_validator" ? wallets.owner : wallets.validator;
    const toAddress  = direction === "owner_to_validator" ? wallets.validator.address : wallets.owner.address;

    this.logger.info(`  EURC transfer ${amount} EURC → ${direction.replace("_", "→")}`);

    // Check EURC balance
    const balRaw = await this.publicClient.readContract({
      address: EURC_CONTRACT,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [fromWallet.address as Address],
    });
    const bal = formatUnits(balRaw, 6);
    if (parseFloat(bal) < parseFloat(amount)) {
      throw new Error(`Insufficient balance: ${bal} EURC`);
    }

    const txHash = await (this.walletManager as any).transferEURC(
      fromWallet.id, fromWallet.address, toAddress, amount
    );
    return { txHash, amount, direction, from: fromWallet.address, to: toAddress, transferredAt: new Date().toISOString() };
  }

  // ── task: eurc_balance ────────────────────────────────────────────────────

  private async executeEURCBalance(task: Task, wallets: WalletPair): Promise<any> {
    const ownerRaw = await this.publicClient.readContract({
      address: EURC_CONTRACT, abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf", args: [wallets.owner.address as Address],
    });
    const validatorRaw = await this.publicClient.readContract({
      address: EURC_CONTRACT, abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf", args: [wallets.validator.address as Address],
    });
    const data = {
      contract: "EURC",
      address: EURC_CONTRACT,
      owner: { address: wallets.owner.address, eurc: formatUnits(ownerRaw, 6) },
      validator: { address: wallets.validator.address, eurc: formatUnits(validatorRaw, 6) },
      checkedAt: new Date().toISOString(),
    };
    this.logger.info(`  EURC — Owner: ${data.owner.eurc} | Validator: ${data.validator.eurc}`);
    return data;
  }

  // ── task: cirbtc_balance ──────────────────────────────────────────────────

  private async executeCIRBTCBalance(task: Task, wallets: WalletPair): Promise<any> {
    const ownerRaw = await this.publicClient.readContract({
      address: CIRBTC_CONTRACT, abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf", args: [wallets.owner.address as Address],
    });
    const validatorRaw = await this.publicClient.readContract({
      address: CIRBTC_CONTRACT, abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf", args: [wallets.validator.address as Address],
    });
    const data = {
      contract: "cirBTC",
      address: CIRBTC_CONTRACT,
      owner: { address: wallets.owner.address, cirbtc: formatUnits(ownerRaw, 8) },
      validator: { address: wallets.validator.address, cirbtc: formatUnits(validatorRaw, 8) },
      checkedAt: new Date().toISOString(),
    };
    this.logger.info(`  cirBTC — Owner: ${data.owner.cirbtc} | Validator: ${data.validator.cirbtc}`);
    return data;
  }

  // ── task: cirbtc_transfer ─────────────────────────────────────────────────

  private async executeCIRBTCTransfer(task: Task, wallets: WalletPair): Promise<any> {
    const amount = task.params.amount || "0.00001";
    const direction = task.params.direction || "owner_to_validator";
    const fromWallet = direction === "owner_to_validator" ? wallets.owner : wallets.validator;
    const toAddress  = direction === "owner_to_validator" ? wallets.validator.address : wallets.owner.address;

    this.logger.info(`  cirBTC transfer ${amount} cirBTC → ${direction.replace("_", "→")}`);

    // Check cirBTC balance
    const balRaw = await this.publicClient.readContract({
      address: CIRBTC_CONTRACT,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [fromWallet.address as Address],
    });
    const bal = formatUnits(balRaw, 8);
    if (parseFloat(bal) < parseFloat(amount)) {
      throw new Error(`Insufficient balance: ${bal} cirBTC`);
    }

    const txHash = await (this.walletManager as any).transferCIRBTC(
      fromWallet.id, fromWallet.address, toAddress, amount
    );
    return { txHash, amount, direction, from: fromWallet.address, to: toAddress, transferredAt: new Date().toISOString() };
  }

  // ── task: multicall_read ──────────────────────────────────────────────────

  private async executeMulticallRead(task: Task, wallets: WalletPair): Promise<any> {
    this.logger.info(`  Multicall3 batch read...`);

    const balanceCallData = encodeFunctionData({
      abi: ERC20_BALANCE_ABI, functionName: "balanceOf",
      args: [wallets.owner.address as Address],
    });

    const calls = [
      { target: USDC_CONTRACT, allowFailure: true, callData: balanceCallData },
      { target: EURC_CONTRACT, allowFailure: true, callData: balanceCallData },
      { target: CIRBTC_CONTRACT, allowFailure: true, callData: balanceCallData },
    ];

    const results = await this.publicClient.readContract({
      address: MULTICALL3, abi: MULTICALL3_ABI,
      functionName: "aggregate3", args: [calls],
    }) as any[];

    const blockNum = await this.publicClient.getBlockNumber();

    const data = {
      blockNumber: blockNum.toString(),
      multicallAddress: MULTICALL3,
      owner: wallets.owner.address,
      results: {
        usdc: results[0]?.success ? formatUnits(BigInt("0x" + results[0].returnData.slice(2)), 6) : "error",
        eurc: results[1]?.success ? formatUnits(BigInt("0x" + results[1].returnData.slice(2)), 6) : "error",
        cirbtc: results[2]?.success ? formatUnits(BigInt("0x" + results[2].returnData.slice(2)), 8) : "error",
      },
      batchSize: calls.length,
      fetchedAt: new Date().toISOString(),
    };

    this.logger.info(`  Multicall: USDC=${data.results.usdc} | EURC=${data.results.eurc} | cirBTC=${data.results.cirbtc}`);
    return data;
  }

  // ── task: cctp_bridge ──────────────────────────────────────────────────────

  private async executeCCTPBridge(task: Task, wallets: WalletPair): Promise<any> {
    const amount = task.params.amount || "1.00";
    const destChain = task.params.destChain || "Base_Sepolia";
    
    // Check USDC balance of owner
    const ownerBal = await this.walletManager.getUSDCBalance(wallets.owner.address);
    const ownerUSDC = parseFloat(ownerBal.usdc);
    
    if (ownerUSDC < parseFloat(amount)) {
      throw new Error(`Insufficient Owner USDC balance to bridge. Has ${ownerUSDC} USDC, need ${amount} USDC`);
    }

    const bridgeResult = await this.walletManager.bridgeUSDC(
      wallets.owner.id,
      wallets.owner.address,
      wallets.validator.address,
      amount,
      destChain
    );

    const burnTx = bridgeResult.steps.find((s: any) => s.name === "burn")?.txHash;
    const mintTx = bridgeResult.steps.find((s: any) => s.name === "mint")?.txHash;

    const data = {
      amount,
      destChain,
      recipient: wallets.validator.address,
      burnTx,
      mintTx,
      state: bridgeResult.state,
      steps: bridgeResult.steps,
      bridgedAt: new Date().toISOString(),
    };

    this.logger.success(`  CCTP Bridge: ${amount} USDC -> ${destChain} initiated. Burn Tx: ${burnTx}`);
    return { ...data, txHash: burnTx || mintTx };
  }

  // ── task: token_swap ───────────────────────────────────────────────────────

  private async executeTokenSwap(task: Task, wallets: WalletPair): Promise<any> {
    const amount = task.params.amount || "1.00";
    const tokenIn = task.params.tokenIn || "USDC";
    const tokenOut = task.params.tokenOut || "EURC";
    const kitKey = process.env.KIT_KEY;

    if (!kitKey) {
      this.logger.warn(`  [SKIP] Skipping token swap: KIT_KEY is not defined in environment variables.`);
      return {
        skipped: true,
        reason: "KIT_KEY missing in env",
        timestamp: new Date().toISOString()
      };
    }

    // Check balance of tokenIn
    let hasBalance = false;
    let currentBalance = "0";
    if (tokenIn === "USDC") {
      const ownerBal = await this.walletManager.getUSDCBalance(wallets.owner.address);
      currentBalance = ownerBal.usdc;
      hasBalance = parseFloat(currentBalance) >= parseFloat(amount);
    } else if (tokenIn === "EURC") {
      const balRaw = await this.publicClient.readContract({
        address: EURC_CONTRACT,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [wallets.owner.address as Address],
      });
      currentBalance = formatUnits(balRaw, 6);
      hasBalance = parseFloat(currentBalance) >= parseFloat(amount);
    } else if (tokenIn === "cirBTC") {
      const balRaw = await this.publicClient.readContract({
        address: CIRBTC_CONTRACT,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [wallets.owner.address as Address],
      });
      currentBalance = formatUnits(balRaw, 8);
      hasBalance = parseFloat(currentBalance) >= parseFloat(amount);
    } else {
      throw new Error(`Unsupported tokenIn: ${tokenIn}`);
    }

    if (!hasBalance) {
      throw new Error(`Insufficient Owner ${tokenIn} balance to swap. Has ${currentBalance} ${tokenIn}, need ${amount} ${tokenIn}`);
    }

    const swapResult = await (this.walletManager as any).swapToken(
      wallets.owner.id,
      wallets.owner.address,
      amount,
      tokenIn,
      tokenOut
    );

    const txHash = swapResult.txHash;
    const amountOut = swapResult.amountOut;

    const data = {
      tokenIn,
      tokenOut,
      amountIn: amount,
      amountOut,
      txHash,
      swappedAt: new Date().toISOString()
    };

    this.logger.success(`  Token Swap: Swapped ${amount} ${tokenIn} -> ${amountOut} ${tokenOut}. Tx: ${txHash}`);
    return data;
  }

  // ── task: random_transfer ──────────────────────────────────────────────────

  private async executeRandomTransfer(task: Task, wallets: WalletPair): Promise<any> {
    const addresses = task.params.addresses || [];
    if (addresses.length === 0) {
      throw new Error("No destination addresses configured in params.addresses");
    }

    const minAmount = parseFloat(task.params.min_amount || "0.001");
    const maxAmount = parseFloat(task.params.max_amount || "0.01");
    const token = task.params.token || "USDC";

    // Select random address
    const toAddress = addresses[Math.floor(Math.random() * addresses.length)] as Address;
    
    // Select random amount
    const randomAmountVal = minAmount + Math.random() * (maxAmount - minAmount);
    
    // Format to match token decimals
    let amountStr = "";
    if (token === "cirBTC") {
      amountStr = randomAmountVal.toFixed(8);
    } else {
      amountStr = randomAmountVal.toFixed(6);
    }

    this.logger.info(`  Random transfer: sending ${amountStr} ${token} to ${toAddress}`);

    let txHash = "";
    const fromWallet = wallets.owner; // Always transfer from owner wallet

    if (token === "USDC") {
      // Check owner USDC balance
      const bal = await this.walletManager.getUSDCBalance(fromWallet.address);
      if (parseFloat(bal.usdc) < parseFloat(amountStr) + 0.1) {
        throw new Error(`Insufficient Owner USDC balance to transfer. Has ${bal.usdc} USDC, need ${amountStr} USDC + gas`);
      }
      txHash = await this.walletManager.transferUSDC(
        fromWallet.id, fromWallet.address, toAddress, amountStr
      );
    } else if (token === "EURC") {
      // Check EURC balance
      const balRaw = await this.publicClient.readContract({
        address: EURC_CONTRACT,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [fromWallet.address as Address],
      });
      const bal = formatUnits(balRaw, 6);
      if (parseFloat(bal) < parseFloat(amountStr)) {
        throw new Error(`Insufficient Owner EURC balance to transfer. Has ${bal} EURC, need ${amountStr} EURC`);
      }
      txHash = await (this.walletManager as any).transferEURC(
        fromWallet.id, fromWallet.address, toAddress, amountStr
      );
    } else if (token === "cirBTC") {
      // Check cirBTC balance
      const balRaw = await this.publicClient.readContract({
        address: CIRBTC_CONTRACT,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [fromWallet.address as Address],
      });
      const bal = formatUnits(balRaw, 8);
      if (parseFloat(bal) < parseFloat(amountStr)) {
        throw new Error(`Insufficient Owner cirBTC balance. Has ${bal} cirBTC, need ${amountStr} cirBTC`);
      }
      txHash = await (this.walletManager as any).transferCIRBTC(
        fromWallet.id, fromWallet.address, toAddress, amountStr
      );
    } else {
      throw new Error(`Unsupported token: ${token}`);
    }

    return {
      token,
      amount: amountStr,
      from: fromWallet.address,
      to: toAddress,
      txHash,
      transferredAt: new Date().toISOString()
    };
  }

  // ── task: deploy_token ──────────────────────────────────────────────────────

  private async executeDeployToken(task: Task, wallets: WalletPair): Promise<any> {
    const name = task.params.name || "Shadow Agent Token";
    const symbol = task.params.symbol || "SHADOW";
    const defaultAdmin = wallets.owner.address;
    
    this.logger.info(`  Deploying custom ERC-20 template: Name="${name}", Symbol="${symbol}"`);
    
    const sanitizedId = this.workerId.replace(/[^a-zA-Z0-9]/g, "");
    const response = await this.scpClient.deployContractTemplate({
      idempotencyKey: crypto.randomUUID(),
      name: `ArcWorkerToken${sanitizedId}`,
      walletId: wallets.owner.id,
      id: "a1b74add-23e0-4712-88d1-6b3009e85a86",
      blockchain: "ARC-TESTNET",
      fee: {
        type: "level",
        config: {
          feeLevel: "MEDIUM"
        }
      },
      templateParameters: {
        name,
        symbol,
        defaultAdmin,
        primarySaleRecipient: defaultAdmin
      }
    });

    const contractId = response.data?.contractIds?.[0];
    const txId = response.data?.transactionId;
    if (!contractId) {
      throw new Error("Failed to deploy Token contract template - no contractId returned");
    }

    this.logger.info(`  ⏳ Token deployment transaction initiated. Contract ID: ${contractId}. Waiting for confirmation...`);

    const contractAddress = await this.waitForContractDeployment(contractId);
    
    this.logger.success(`✅ Custom Token deployed successfully! Address: ${contractAddress}`);
    this.saveContractAddress("token", contractAddress);

    return {
      contractId,
      contractAddress,
      name,
      symbol,
      ownerAddress: defaultAdmin,
      deployedAt: new Date().toISOString(),
      txHash: txId
    };
  }

  // ── task: deploy_nft ────────────────────────────────────────────────────────

  private async executeDeployNFT(task: Task, wallets: WalletPair): Promise<any> {
    const name = task.params.name || "Arc Sentinel Collectible";
    const symbol = task.params.symbol || "SENTINEL";
    const defaultAdmin = wallets.owner.address;
    
    this.logger.info(`  Deploying custom ERC-721 template: Name="${name}", Symbol="${symbol}"`);
    
    const sanitizedId = this.workerId.replace(/[^a-zA-Z0-9]/g, "");
    const response = await this.scpClient.deployContractTemplate({
      idempotencyKey: crypto.randomUUID(),
      name: `ArcWorkerNFT${sanitizedId}`,
      walletId: wallets.owner.id,
      id: "76b83278-50e2-4006-8b63-5b1a2a814533",
      blockchain: "ARC-TESTNET",
      fee: {
        type: "level",
        config: {
          feeLevel: "MEDIUM"
        }
      },
      templateParameters: {
        name,
        symbol,
        defaultAdmin,
        primarySaleRecipient: defaultAdmin,
        royaltyRecipient: defaultAdmin,
        royaltyPercent: 5 // 5% royalty
      }
    });

    const contractId = response.data?.contractIds?.[0];
    const txId = response.data?.transactionId;
    if (!contractId) {
      throw new Error("Failed to deploy NFT contract template - no contractId returned");
    }

    this.logger.info(`  ⏳ NFT deployment transaction initiated. Contract ID: ${contractId}. Waiting for confirmation...`);

    const contractAddress = await this.waitForContractDeployment(contractId);
    
    this.logger.success(`✅ Custom NFT deployed successfully! Address: ${contractAddress}`);
    this.saveContractAddress("nft", contractAddress);

    return {
      contractId,
      contractAddress,
      name,
      symbol,
      ownerAddress: defaultAdmin,
      deployedAt: new Date().toISOString(),
      txHash: txId
    };
  }

  // ── task: say_gm ────────────────────────────────────────────────────────────

  private async executeSayGM(task: Task, wallets: WalletPair): Promise<any> {
    const contractAddress = task.params.contractAddress as Address;
    const message = task.params.message || "GM from Arc Worker Bot! 🤖";
    
    if (!contractAddress || contractAddress.startsWith("YOUR_") || contractAddress === "0x5FbDB2315678afecb367f032d93F642f64180aa3") {
      throw new Error("Live GM contract address not configured in task parameters. Please deploy and configure it on Arc Testnet.");
    }
    
    this.logger.info(`  Sending GM message: "${message}" to GM contract...`);
    
    const txHash = await this.walletManager.executeContract(
      wallets.owner.address,
      contractAddress,
      "sayGM(string)",
      [message],
      "sayGM"
    );
    
    return {
      txHash,
      contractAddress,
      message,
      sender: wallets.owner.address,
      timestamp: new Date().toISOString()
    };
  }

  // ── task: x402_nanopayment ──────────────────────────────────────────────────

  private async executeX402Nanopayment(task: Task, wallets: WalletPair): Promise<any> {
    const url = task.params.url || "http://localhost:3000/api/premium/quote";
    const method = (task.params.method || "GET") as "GET" | "POST" | "PUT" | "DELETE";
    const body = task.params.body || null;
    const amountToDeposit = task.params.amountToDeposit || "1.00";

    this.logger.info(`  Setting up x402 nanopayment for: ${method} ${url}`);

    // 1. Load or generate a persistent local EVM wallet for signing authorizations
    const walletStateDir = path.resolve(`./runtime/${this.workerId}/state`);
    fs.mkdirSync(walletStateDir, { recursive: true });
    const localWalletFile = path.join(walletStateDir, "nanopay-wallet.json");

    let privateKey: `0x${string}`;
    if (fs.existsSync(localWalletFile)) {
      try {
        const state = JSON.parse(fs.readFileSync(localWalletFile, "utf-8"));
        privateKey = state.privateKey;
      } catch (err) {
        this.logger.warn(`Failed to read local nanopay-wallet.json, generating a new one.`);
        privateKey = generatePrivateKey();
        fs.writeFileSync(localWalletFile, JSON.stringify({ privateKey }, null, 2));
      }
    } else {
      privateKey = generatePrivateKey();
      fs.writeFileSync(localWalletFile, JSON.stringify({ privateKey }, null, 2));
    }

    const localAccount = privateKeyToAccount(privateKey);
    const localAddress = localAccount.address;
    this.logger.info(`  Local nanopay signing wallet: ${localAddress}`);

    // 2. Initialize GatewayClient from x402 SDK
    const gateway = new GatewayClient({
      chain: "arcTestnet",
      privateKey: privateKey,
    });

    // 3. Get balances (wallet + gateway) in one call
    let balances: any;
    try {
      balances = await gateway.getBalances();
    } catch (err: any) {
      this.logger.warn(`  Failed to retrieve balances from Gateway Client: ${err.message}. Retrying via public client...`);
      // Fallback: query wallet balance via public client
      const balRaw = await this.publicClient.readContract({
        address: USDC_CONTRACT,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [localAddress],
      });
      balances = {
        wallet: { formatted: formatUnits(balRaw, 6) },
        gateway: { formattedAvailable: "0.00" }
      };
    }

    const localBal = parseFloat(balances.wallet.formatted);
    let gatewayBalance = parseFloat(balances.gateway?.formattedAvailable || "0.00");
    this.logger.info(`  Local wallet balance: ${localBal} USDC | Gateway balance: ${gatewayBalance} USDC`);

    // 4. Auto-fund local wallet if local balance is low (< 2.0 USDC)
    if (localBal < 2.0) {
      this.logger.info(`  Local balance low (< 2.0 USDC). Auto-funding 5.0 USDC from Circle owner wallet...`);
      const ownerBal = await this.walletManager.getUSDCBalance(wallets.owner.address);
      if (parseFloat(ownerBal.usdc) < 6.0) {
        throw new Error(`Insufficient funds in Circle owner wallet (${ownerBal.usdc} USDC) to fund local nanopayment wallet.`);
      }

      // Execute transfer via Circle SCP
      const fundTxHash = await this.walletManager.transferUSDC(
        wallets.owner.id,
        wallets.owner.address,
        localAddress,
        "5.00"
      );
      this.logger.info(`  Funding tx submitted. Hash: ${fundTxHash}`);

      // Wait a few seconds for block confirmation
      this.logger.info(`  Waiting 5 seconds for block confirmation...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      
      // Update balance reading
      try {
        const newBal = await gateway.getBalances();
        balances.wallet.formatted = newBal.wallet.formatted;
      } catch {}
    }

    // 5. Deposit USDC to Gateway if Gateway balance is low (< 1.0 USDC)
    let depositTxHash: string | undefined;
    if (gatewayBalance < 1.0) {
      this.logger.info(`  Gateway balance low (< 1.0 USDC). Depositing ${amountToDeposit} USDC...`);
      try {
        const depResult = await gateway.deposit(amountToDeposit);
        this.logger.success(`  Gateway deposit succeeded!`);
        depositTxHash = depResult.depositTxHash || depResult.approvalTxHash;
      } catch (err: any) {
        throw new Error(`Failed to deposit USDC to Circle Gateway: ${err.message}`);
      }
    }

    // 6. Make the x402 payment request
    this.logger.info(`  Executing payment request to ${url}...`);
    let payResult: any;
    try {
      const options: any = { method };
      if (method !== "GET" && method !== "HEAD" && body !== null && body !== undefined) {
        options.body = body;
      }
      payResult = await gateway.pay(url, options);
      this.logger.success(`  x402 payment request succeeded! Amount: ${payResult.formattedAmount} USDC`);
    } catch (err: any) {
      throw new Error(`x402 payment request failed: ${err.message}`);
    }

    return {
      localAddress,
      gatewayBalance: gatewayBalance.toString(),
      localWalletBalance: balances.wallet.formatted,
      deposited: depositTxHash ? amountToDeposit : "0.00",
      depositTxHash,
      spent: payResult.formattedAmount || "0.00",
      result: payResult.data || payResult,
      timestamp: new Date().toISOString(),
    };
  }

  // ── task: x402_puzzle_solver ────────────────────────────────────────────────
  private async executeX402PuzzleSolver(task: Task, wallets: WalletPair): Promise<any> {
    const baseUrl = task.params.url || "http://localhost:3000/api/premium/puzzle";
    const amountToDeposit = task.params.amountToDeposit || "1.00";

    this.logger.info(`  [Puzzle Solver] Starting multi-step EIP-3009 puzzle game at ${baseUrl}`);

    // 1. Load or generate local signing key
    const walletStateDir = path.resolve(`./runtime/${this.workerId}/state`);
    fs.mkdirSync(walletStateDir, { recursive: true });
    const localWalletFile = path.join(walletStateDir, "nanopay-wallet.json");

    let privateKey: `0x${string}`;
    if (fs.existsSync(localWalletFile)) {
      try {
        const state = JSON.parse(fs.readFileSync(localWalletFile, "utf-8"));
        privateKey = state.privateKey;
      } catch (err) {
        privateKey = generatePrivateKey();
        fs.writeFileSync(localWalletFile, JSON.stringify({ privateKey }, null, 2));
      }
    } else {
      privateKey = generatePrivateKey();
      fs.writeFileSync(localWalletFile, JSON.stringify({ privateKey }, null, 2));
    }

    const localAddress = privateKeyToAccount(privateKey).address;
    const gateway = new GatewayClient({
      chain: "arcTestnet",
      privateKey: privateKey,
    });

    // 2. Check balances
    let balances: any;
    try {
      balances = await gateway.getBalances();
    } catch (err: any) {
      const balRaw = await this.publicClient.readContract({
        address: USDC_CONTRACT,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [localAddress],
      });
      balances = {
        wallet: { formatted: formatUnits(balRaw, 6) },
        gateway: { formattedAvailable: "0.00" }
      };
    }

    const localBal = parseFloat(balances.wallet.formatted);
    let gatewayBalance = parseFloat(balances.gateway?.formattedAvailable || "0.00");

    // 3. Auto-fund local wallet if < 2.0 USDC
    if (localBal < 2.0) {
      this.logger.info(`  [Puzzle Solver] Local balance low (${localBal} USDC). Auto-funding 5.0 USDC...`);
      const ownerBal = await this.walletManager.getUSDCBalance(wallets.owner.address);
      if (parseFloat(ownerBal.usdc) < 6.0) {
        throw new Error(`Insufficient funds in Circle owner wallet to fund puzzle wallet.`);
      }
      await this.walletManager.transferUSDC(wallets.owner.id, wallets.owner.address, localAddress, "5.00");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        const newBal = await gateway.getBalances();
        balances.wallet.formatted = newBal.wallet.formatted;
      } catch {}
    }

    // 4. Auto-deposit to gateway if gateway balance is low (< 1.0 USDC)
    let depositTxHash: string | undefined;
    if (gatewayBalance < 1.0) {
      this.logger.info(`  [Puzzle Solver] Gateway balance low (${gatewayBalance} USDC). Depositing ${amountToDeposit} USDC...`);
      const depResult = await gateway.deposit(amountToDeposit);
      depositTxHash = depResult.depositTxHash || depResult.approvalTxHash;
    }

    const stepsCompleted: any[] = [];
    let totalSpent = 0;

    // --- STEP 1: GET puzzle (Retrieve Question 1) ---
    this.logger.info(`  [Puzzle Solver] Executing Step 1: GET ${baseUrl} ($0.005 USDC)...`);
    const step1Res = await gateway.pay(baseUrl, { method: "GET" });
    const step1Data = step1Res.data || step1Res;
    this.logger.success(`  [Puzzle Solver] Step 1 Succeeded! Question: "${step1Data.question}"`);
    stepsCompleted.push({
      step: 1,
      cost: "0.005",
      question: step1Data.question,
      answer: "42"
    });
    totalSpent += 0.005;

    // --- STEP 2: POST answer 1 (Solve Question 1 -> Get Question 2) ---
    this.logger.info(`  [Puzzle Solver] Executing Step 2: POST ${baseUrl} with answer "42" ($0.01 USDC)...`);
    const step2Res = await gateway.pay(baseUrl, {
      method: "POST",
      body: JSON.stringify({ step: 1, answer: "42" }),
      headers: { "Content-Type": "application/json" }
    } as any);
    const step2Data = step2Res.data || step2Res;
    
    if (!step2Data.success) {
      throw new Error(`Step 2 answer verification failed: ${step2Data.error}`);
    }
    
    this.logger.success(`  [Puzzle Solver] Step 2 Succeeded! Next Question: "${step2Data.question}"`);
    stepsCompleted.push({
      step: 2,
      cost: "0.01",
      question: step2Data.question,
      answer: "CRA"
    });
    totalSpent += 0.01;

    // --- STEP 3: POST answer 2 (Solve Question 2 -> Get Reward Secret) ---
    this.logger.info(`  [Puzzle Solver] Executing Step 3: POST ${baseUrl} with answer "CRA" ($0.01 USDC)...`);
    const step3Res = await gateway.pay(baseUrl, {
      method: "POST",
      body: JSON.stringify({ step: 2, answer: "CRA" }),
      headers: { "Content-Type": "application/json" }
    } as any);
    const step3Data = step3Res.data || step3Res;

    if (!step3Data.success) {
      throw new Error(`Step 3 answer verification failed: ${step3Data.error}`);
    }

    this.logger.success(`  [Puzzle Solver] Game Completed successfully!`);
    this.logger.success(`  [Puzzle Solver] Reward Message: "${step3Data.message}"`);
    stepsCompleted.push({
      step: 3,
      cost: "0.01",
      message: step3Data.message
    });
    totalSpent += 0.01;

    return {
      localAddress,
      gatewayBalance: gatewayBalance.toString(),
      localWalletBalance: balances.wallet.formatted,
      deposited: depositTxHash ? amountToDeposit : "0.00",
      depositTxHash,
      totalSpent: totalSpent.toString(),
      steps: stepsCompleted,
      timestamp: new Date().toISOString(),
    };
  }

  // ── task: auto_recycle ──────────────────────────────────────────────────────
  private async executeAutoRecycle(task: Task, wallets: WalletPair): Promise<any> {
    const minUSDC = parseFloat(task.params.minUSDC || "20.00");
    const swapAmount = task.params.swapAmount || "50.00";
    const kitKey = process.env.KIT_KEY;

    if (!kitKey) {
      this.logger.warn(`  [SKIP] Skipping Auto-Recycler: KIT_KEY is not defined.`);
      return { skipped: true, reason: "KIT_KEY missing", timestamp: new Date().toISOString() };
    }

    this.logger.info(`  [Auto-Recycler] Checking Owner USDC balance (threshold: ${minUSDC} USDC)...`);

    // Check USDC balance of owner
    const ownerBal = await this.walletManager.getUSDCBalance(wallets.owner.address);
    const ownerUSDC = parseFloat(ownerBal.usdc);

    this.logger.info(`  [Auto-Recycler] Owner USDC Balance: ${ownerUSDC} USDC`);

    if (ownerUSDC < minUSDC) {
      this.logger.warn(`  [Auto-Recycler] Owner USDC balance is low (${ownerUSDC} USDC < ${minUSDC} USDC)!`);
      this.logger.info(`  [Auto-Recycler] Checking Owner EURC balance to recycle...`);

      // Check EURC balance of owner
      const balRaw = await this.publicClient.readContract({
        address: EURC_CONTRACT,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [wallets.owner.address as Address],
      });
      const ownerEURC = parseFloat(formatUnits(balRaw, 6));
      this.logger.info(`  [Auto-Recycler] Owner EURC Balance: ${ownerEURC} EURC`);

      if (ownerEURC < parseFloat(swapAmount)) {
        this.logger.error(`  [Auto-Recycler] Cannot recycle: Owner EURC balance too low (${ownerEURC} EURC, need ${swapAmount} EURC)`);
        return { recycled: false, reason: "Insufficient EURC balance", timestamp: new Date().toISOString() };
      }

      this.logger.info(`  [Auto-Recycler] Swapping ${swapAmount} EURC → USDC to recycle liquidity...`);
      const swapResult = await (this.walletManager as any).swapToken(
        wallets.owner.id,
        wallets.owner.address,
        swapAmount,
        "EURC",
        "USDC"
      );

      const txHash = swapResult.txHash;
      const amountOut = swapResult.amountOut;

      this.logger.success(`  [Auto-Recycler] Recycled successfully! Swapped ${swapAmount} EURC -> ${amountOut} USDC. Tx: ${txHash}`);

      return {
        recycled: true,
        tokenIn: "EURC",
        tokenOut: "USDC",
        amountIn: swapAmount,
        amountOut,
        txHash,
        timestamp: new Date().toISOString()
      };
    } else {
      this.logger.info(`  [Auto-Recycler] Owner USDC liquidity is healthy. No recycling needed.`);
      return {
        recycled: false,
        reason: "USDC balance above threshold",
        timestamp: new Date().toISOString()
      };
    }
  }

  private async executeLendingBorrowing(task: Task, wallets: WalletPair): Promise<any> {
    const action = task.params.action || "auto_manage";
    const amountStr = task.params.amount || "0";
    
    // Load deployed lending pool address
    const contractsPath = path.resolve("./runtime/worker-01/state/contracts.json");
    if (!fs.existsSync(contractsPath)) {
      throw new Error("contracts.json not found! Lending Pool not deployed.");
    }
    const contracts = JSON.parse(fs.readFileSync(contractsPath, "utf8"));
    const lendingPoolAddress = contracts.multi_collateral_pool || contracts.lending_pool;
    if (!lendingPoolAddress) {
      throw new Error("Lending pool address not found in contracts.json");
    }

    this.logger.info(`  [Lending & Borrowing] Action: ${action} | Pool: ${lendingPoolAddress}`);

    if (action === "deposit") {
      const isBTC = task.params.token?.toLowerCase() === "cirbtc";
      if (isBTC) {
        const amountRaw = parseUnits(amountStr, 8);
        this.logger.info(`  [Lending] Approving ${amountStr} cirBTC to MultiCollateralPool...`);
        await this.walletManager.executeContract(
          wallets.owner.address,
          CIRBTC_CONTRACT,
          "approve(address,uint256)",
          [lendingPoolAddress, amountRaw.toString()],
          "Approve cirBTC to MultiCollateralPool"
        );

        this.logger.info(`  [Lending] Depositing ${amountStr} cirBTC as collateral...`);
        const txHash = await this.walletManager.executeContract(
          wallets.owner.address,
          lendingPoolAddress,
          "depositCirBTC(uint256)",
          [amountRaw.toString()],
          "Deposit cirBTC Collateral"
        );

        return { action, token: "cirBTC", amount: amountStr, txHash, timestamp: new Date().toISOString() };
      } else {
        const amountRaw = parseUnits(amountStr, 6);
        this.logger.info(`  [Lending] Approving ${amountStr} USDC to MultiCollateralPool...`);
        await this.walletManager.executeContract(
          wallets.owner.address,
          USDC_CONTRACT,
          "approve(address,uint256)",
          [lendingPoolAddress, amountRaw.toString()],
          "Approve USDC to MultiCollateralPool"
        );

        this.logger.info(`  [Lending] Depositing ${amountStr} USDC as collateral...`);
        const txHash = await this.walletManager.executeContract(
          wallets.owner.address,
          lendingPoolAddress,
          "depositUSDC(uint256)",
          [amountRaw.toString()],
          "Deposit USDC Collateral"
        );

        return { action, token: "USDC", amount: amountStr, txHash, timestamp: new Date().toISOString() };
      }
    }

    if (action === "borrow") {
      const amountRaw = parseUnits(amountStr, 6);
      this.logger.info(`  [Lending] Borrowing ${amountStr} EURC...`);
      const txHash = await this.walletManager.executeContract(
        wallets.owner.address,
        lendingPoolAddress,
        "borrowEURC(uint256)",
        [amountRaw.toString()],
        "Borrow EURC"
      );

      return { action, amount: amountStr, txHash, timestamp: new Date().toISOString() };
    }

    if (action === "repay") {
      const amountRaw = parseUnits(amountStr, 6);
      this.logger.info(`  [Lending] Approving ${amountStr} EURC to LendingPool...`);
      await this.walletManager.executeContract(
        wallets.owner.address,
        EURC_CONTRACT,
        "approve(address,uint256)",
        [lendingPoolAddress, amountRaw.toString()],
        "Approve EURC to LendingPool"
      );

      this.logger.info(`  [Lending] Repaying ${amountStr} EURC debt...`);
      const txHash = await this.walletManager.executeContract(
        wallets.owner.address,
        lendingPoolAddress,
        "repayEURC(uint256)",
        [amountRaw.toString()],
        "Repay EURC Debt"
      );

      return { action, amount: amountStr, txHash, timestamp: new Date().toISOString() };
    }

    if (action === "withdraw") {
      const isBTC = task.params.token?.toLowerCase() === "cirbtc";
      if (isBTC) {
        const amountRaw = parseUnits(amountStr, 8);
        this.logger.info(`  [Lending] Withdrawing ${amountStr} cirBTC collateral...`);
        const txHash = await this.walletManager.executeContract(
          wallets.owner.address,
          lendingPoolAddress,
          "withdrawCirBTC(uint256)",
          [amountRaw.toString()],
          "Withdraw cirBTC Collateral"
        );

        return { action, token: "cirBTC", amount: amountStr, txHash, timestamp: new Date().toISOString() };
      } else {
        const amountRaw = parseUnits(amountStr, 6);
        this.logger.info(`  [Lending] Withdrawing ${amountStr} USDC collateral...`);
        const txHash = await this.walletManager.executeContract(
          wallets.owner.address,
          lendingPoolAddress,
          "withdrawUSDC(uint256)",
          [amountRaw.toString()],
          "Withdraw USDC Collateral"
        );

        return { action, token: "USDC", amount: amountStr, txHash, timestamp: new Date().toISOString() };
      }
    }

    if (action === "auto_manage") {
      this.logger.info(`  [Lending] Querying account position data...`);
      
      const [collateralUSDC, collateralCirBTC, borrowedEURC, currentBtcPrice, totalCollateralUSD, maxBorrowEURC, healthFactor] = await this.publicClient.readContract({
        address: lendingPoolAddress as Address,
        abi: LENDING_POOL_ABI,
        functionName: "getAccountData",
        args: [wallets.owner.address as Address],
      }) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint];

      const collateralUSDCVal = parseFloat(formatUnits(collateralUSDC, 6));
      const collateralCirBTCVal = parseFloat(formatUnits(collateralCirBTC, 8));
      const borrowedVal = parseFloat(formatUnits(borrowedEURC, 6));
      const btcPriceVal = parseFloat(formatUnits(currentBtcPrice, 6));
      const totalCollVal = parseFloat(formatUnits(totalCollateralUSD, 6));
      const maxBorrowVal = parseFloat(formatUnits(maxBorrowEURC, 6));
      const hf = Number(healthFactor);

      this.logger.info(`  [Lending Position] USDC Collateral: ${collateralUSDCVal} | cirBTC Collateral: ${collateralCirBTCVal} (Price: $${btcPriceVal.toLocaleString()}) | Total Collateral: $${totalCollVal.toFixed(2)} | Borrowed: ${borrowedVal} EURC | Max Borrow: ${maxBorrowVal} EURC | HF: ${hf === 99999 ? "Safe" : (hf / 100).toFixed(2)}`);

      let txHash: string | undefined;
      let executedAction = "none";
      let autoAmount = "0";

      let simulateLowUSDC = false;
      let simMode = "deleverage"; // "deleverage" or "cctp"
      const simPath = path.resolve(`./runtime/${this.workerId}/state/simulate-low-usdc.json`);
      if (fs.existsSync(simPath)) {
        try {
          const simData = JSON.parse(fs.readFileSync(simPath, "utf-8"));
          simulateLowUSDC = !!simData.active;
          if (simData.mode) simMode = simData.mode;
        } catch {}
      }

      if (hf < 120 && borrowedVal > 0) {
        this.logger.warn(`  [Lending Warning] Health Factor is low (${(hf / 100).toFixed(2)} < 1.20). Auto-defending position...`);
        const ownerBal = await this.walletManager.getUSDCBalance(wallets.owner.address);
        const actualUSDC = parseFloat(ownerBal.usdc);
        const usdcBalance = simulateLowUSDC ? 0.5 : actualUSDC;

        if (usdcBalance >= 5.0) {
          executedAction = "deposit";
          autoAmount = "5.00";
          this.logger.info(`  [Lending Auto-Deposit] Depositing 5.00 USDC collateral to increase Health Factor...`);
          
          const amountRaw = parseUnits(autoAmount, 6);
          await this.walletManager.executeContract(
            wallets.owner.address,
            USDC_CONTRACT,
            "approve(address,uint256)",
            [lendingPoolAddress, amountRaw.toString()],
            "Approve USDC to LendingPool"
          );

          txHash = await this.walletManager.executeContract(
            wallets.owner.address,
            lendingPoolAddress,
            "depositUSDC(uint256)",
            [amountRaw.toString()],
            "Deposit USDC Collateral"
          );
        } else if (simMode === "deleverage" && collateralCirBTCVal > 0) {
          // Idea 1: Emergency Deleverage
          executedAction = "deleverage";
          autoAmount = "0.00005000";
          const btcAmountSat = 5000n; // 0.00005 BTC in 8 decimals
          this.logger.warn(`  [Emergency Deleverage] Low USDC balance (${usdcBalance} USDC). Selling 0.00005 cirBTC collateral directly on-chain to repay debt...`);
          
          txHash = await this.walletManager.executeContract(
            wallets.owner.address,
            lendingPoolAddress,
            "emergencyDeleverage(uint256)",
            [btcAmountSat.toString()],
            "Emergency Deleverage"
          );
          this.logger.success(`  [Emergency Deleverage] On-chain deleveraging succeeded! Tx: ${txHash}`);
          
          try { fs.writeFileSync(simPath, JSON.stringify({ active: false, mode: "deleverage" }, null, 2)); } catch {}
        } else {
          // Idea 2: Circle CCTP Cross-Chain Simulation
          executedAction = "cctp_sim";
          autoAmount = "10.00";
          this.logger.warn(`  [Circle CCTP Simulation] Low USDC balance and no BTC collateral to sell.`);
          this.logger.info(`  [CCTP Bridge] Initiating cross-chain bridge transfer of 10.00 USDC from Base Sepolia to Arc...`);
          
          const validatorBal = await this.walletManager.getUSDCBalance(wallets.validator.address);
          if (parseFloat(validatorBal.usdc) >= 10.0) {
            this.logger.info(`  [CCTP Gateway] Minting 10.00 USDC on Arc Testnet via Circle CCTP...`);
            const refillTx = await this.walletManager.transferUSDC(
              wallets.validator.id,
              wallets.validator.address,
              wallets.owner.address,
              "10.00"
            );
            this.logger.success(`  [CCTP Bridge Confirmed] Received 10.00 USDC on Arc via CCTP. Tx: ${refillTx}`);
            
            executedAction = "deposit_after_cctp";
            autoAmount = "5.00";
            this.logger.info(`  [Lending Auto-Deposit] Depositing 5.00 USDC collateral from bridged funds...`);
            const amountRaw = parseUnits(autoAmount, 6);
            await this.walletManager.executeContract(
              wallets.owner.address,
              USDC_CONTRACT,
              "approve(address,uint256)",
              [lendingPoolAddress, amountRaw.toString()],
              "Approve USDC to LendingPool"
            );
            txHash = await this.walletManager.executeContract(
              wallets.owner.address,
              lendingPoolAddress,
              "depositUSDC(uint256)",
              [amountRaw.toString()],
              "Deposit USDC Collateral"
            );
            
            try { fs.writeFileSync(simPath, JSON.stringify({ active: false, mode: "cctp" }, null, 2)); } catch {}
          } else {
            this.logger.error(`  [CCTP Simulation Failed] Validator wallet has insufficient USDC to mock CCTP bridge.`);
          }
        }
      } 
      else if ((hf > 300 || hf === 99999) && collateralUSDCVal < 10.0 && collateralCirBTCVal === 0.0) {
        const ownerBal = await this.walletManager.getUSDCBalance(wallets.owner.address);
        if (parseFloat(ownerBal.usdc) > 50.0) {
          executedAction = "deposit";
          autoAmount = "10.00";
          this.logger.info(`  [Lending Auto-Deposit] Collateral is low (${collateralUSDCVal} USDC). Depositing ${autoAmount} USDC to prepare credit line...`);

          const amountRaw = parseUnits(autoAmount, 6);
          await this.walletManager.executeContract(
            wallets.owner.address,
            USDC_CONTRACT,
            "approve(address,uint256)",
            [lendingPoolAddress, amountRaw.toString()],
            "Approve USDC to LendingPool"
          );

          txHash = await this.walletManager.executeContract(
            wallets.owner.address,
            lendingPoolAddress,
            "depositUSDC(uint256)",
            [amountRaw.toString()],
            "Deposit USDC Collateral"
          );
        }
      }

      return {
        action: "auto_manage",
        executedAction,
        autoAmount,
        collateralUSDC: collateralUSDCVal.toString(),
        collateralCirBTC: collateralCirBTCVal.toString(),
        borrowedEURC: borrowedVal.toString(),
        currentBtcPrice: btcPriceVal.toString(),
        totalCollateralUSD: totalCollVal.toString(),
        maxBorrowEURC: maxBorrowVal.toString(),
        healthFactor: hf.toString(),
        txHash,
        timestamp: new Date().toISOString()
      };
    }

    throw new Error(`Unsupported lending action: ${action}`);
  }


  // ── Deployment Helper Methods ──────────────────────────────────────────────

  private async waitForContractDeployment(contractId: string, maxRetries = 60): Promise<string> {
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const resp = await this.scpClient.getContract({ id: contractId });
        const status = resp.data?.contract?.status;
        const address = resp.data?.contract?.contractAddress;
        
        if (address && address !== "0x0000000000000000000000000000000000000000") {
          return address;
        }
        if (status === "FAILED") {
          throw new Error("Contract deployment failed in status check");
        }
      } catch (err: any) {
        if (err.message && err.message.includes("failed")) throw err;
      }
    }
    throw new Error(`Timeout waiting for contract deployment of ID: ${contractId}`);
  }

  private saveContractAddress(key: "token" | "nft", address: string): void {
    const f = path.resolve(`./runtime/${this.workerId}/state/contracts.json`);
    let data: any = {};
    if (fs.existsSync(f)) {
      try { data = JSON.parse(fs.readFileSync(f, "utf-8")); } catch {}
    }
    data[key] = address;
    fs.writeFileSync(f, JSON.stringify(data, null, 2));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private result(task: Task, status: TaskResult["status"], data: any, txHash?: string, error?: string, startTime = Date.now()): TaskResult {
    return {
      taskId: task.id, taskName: task.name, taskType: task.type,
      status, result: data, txHash, error,
      executedAt: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    };
  }

  private saveResult(result: TaskResult): void {
    const filepath = path.join(this.resultsDir, `${result.taskId}-${Date.now()}.json`);
    fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
  }

  private loadOnceState(): void {
    const f = path.resolve(`./runtime/${this.workerId}/state/once-tasks.json`);
    if (fs.existsSync(f)) {
      try { this.completedOnce = new Set(JSON.parse(fs.readFileSync(f, "utf-8")).completed || []); } catch {}
    }
  }

  private async executeLendingActionDirect(
    wallets: WalletPair,
    action: "deposit" | "borrow" | "repay",
    token: "USDC" | "EURC",
    amount: string
  ): Promise<any> {
    const dummyTask: Task = {
      id: `ai-dummy-lending-${Date.now()}`,
      name: `AI Autonomous ${action}`,
      type: "lending_borrowing",
      description: "",
      enabled: true,
      schedule: "manual",
      priority: 1,
      params: { action, amount, token },
      deliverable: { type: "json", hash_content: false }
    };
    return this.executeLendingBorrowing(dummyTask, wallets);
  }

  private async executeA2ACommerceDirect(wallets: WalletPair, amount: string): Promise<any> {
    const dummyTask: Task = {
      id: `task-033`,
      name: "A2A Commerce Buy Data",
      type: "x402_nanopayment",
      description: "",
      enabled: true,
      schedule: "manual",
      priority: 1,
      params: {
        url: "http://localhost:3000/api/a2a/quote",
        method: "GET"
      },
      deliverable: { type: "json", hash_content: true }
    };
    return this.executeX402Nanopayment(dummyTask, wallets);
  }

  private async executeAIBrainDecision(task: Task, wallets: WalletPair): Promise<any> {
    this.logger.info("  [AI Decision Engine] Đang phân tích trạng thái ví và lending...");
    
    // 1. Đọc số dư ví của Owner
    const ownerUSDCBal = await this.walletManager.getUSDCBalance(wallets.owner.address);
    const ownerUSDC = parseFloat(ownerUSDCBal.usdc);
    
    const ownerEURCRaw = await this.publicClient.readContract({
      address: EURC_CONTRACT, abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf", args: [wallets.owner.address as Address],
    });
    const ownerEURC = parseFloat(formatUnits(ownerEURCRaw, 6));

    const ownerBTCRaw = await this.publicClient.readContract({
      address: CIRBTC_CONTRACT, abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf", args: [wallets.owner.address as Address],
    });
    const ownerBTC = parseFloat(formatUnits(ownerBTCRaw, 8));

    // Đọc trạng thái vị thế Lending
    let collateralUSDC = 0;
    let collateralCirBTC = 0;
    let borrowedEURC = 0;
    let healthFactor = 999.99;
    let btcPrice = 90000;
    let repScore = 95;

    try {
      const contractsPath = path.resolve(`./runtime/${this.workerId}/state/contracts.json`);
      if (fs.existsSync(contractsPath)) {
        const contracts = JSON.parse(fs.readFileSync(contractsPath, "utf-8"));
        const lendingPoolAddress = contracts.multi_collateral_pool;
        if (lendingPoolAddress) {
          const [cUSDC, cBTC, bEURC, currentBtcPrice, totalCollateralUSD, maxBorrowEURC, hFactor] = await this.publicClient.readContract({
            address: lendingPoolAddress as Address,
            abi: LENDING_POOL_ABI,
            functionName: "getAccountData",
            args: [wallets.owner.address as Address],
          }) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint];
          
          collateralUSDC = parseFloat(formatUnits(cUSDC, 6));
          collateralCirBTC = parseFloat(formatUnits(cBTC, 8));
          borrowedEURC = parseFloat(formatUnits(bEURC, 6));
          btcPrice = parseFloat(formatUnits(currentBtcPrice, 6));
          healthFactor = hFactor === 99999n ? 999.99 : Number(hFactor) / 100;
        }
      }
    } catch (err: any) {
      this.logger.warn(`  [AI Decision Engine] Không thể kết nối tới Lending Pool: ${err.message}`);
    }

    const state = {
      ownerUSDC,
      ownerEURC,
      ownerBTC,
      collateralUSDC,
      collateralCirBTC,
      borrowedEURC,
      healthFactor,
      btcPrice,
      repScore
    };

    // 2. Gọi AI Brain quyết định
    const decision = await this.aiBrain.getDecision(state);
    this.logger.success(`  [AI Decision Engine] Hành động đề xuất: ${decision.action} | Lý do: ${decision.reason}`);

    // 3. Thực thi hành động
    let executionResult: any = { decision };
    let txHash: string | undefined;

    if (decision.action === "DEPOSIT_COLLATERAL") {
      const amountStr = parseFloat(decision.amount).toFixed(2);
      this.logger.info(`  [AI Execute] Tiến hành nạp ${amountStr} USDC thế chấp...`);
      try {
        const r = await this.executeLendingActionDirect(wallets, "deposit", "USDC", amountStr);
        txHash = r.txHash;
        executionResult.execution = r;
      } catch (err: any) {
        this.logger.error(`  [AI Execute Failed] Nạp thế chấp thất bại: ${err.message}`);
        executionResult.error = err.message;
      }
    } else if (decision.action === "BORROW_EURC") {
      const amountStr = parseFloat(decision.amount).toFixed(2);
      this.logger.info(`  [AI Execute] Tiến hành vay ${amountStr} EURC...`);
      try {
        const r = await this.executeLendingActionDirect(wallets, "borrow", "EURC", amountStr);
        txHash = r.txHash;
        executionResult.execution = r;
      } catch (err: any) {
        this.logger.error(`  [AI Execute Failed] Vay EURC thất bại: ${err.message}`);
        executionResult.error = err.message;
      }
    } else if (decision.action === "REPAY_DEBT") {
      const amountStr = parseFloat(decision.amount).toFixed(2);
      this.logger.info(`  [AI Execute] Tiến hành trả bớt nợ ${amountStr} EURC...`);
      try {
        const r = await this.executeLendingActionDirect(wallets, "repay", "EURC", amountStr);
        txHash = r.txHash;
        executionResult.execution = r;
      } catch (err: any) {
        this.logger.error(`  [AI Execute Failed] Trả nợ thất bại: ${err.message}`);
        executionResult.error = err.message;
      }
    } else if (decision.action === "A2A_COMMERCE") {
      this.logger.info(`  [AI Execute] Tiến hành mua dữ liệu từ Agent 2 (Validator) giá ${decision.amount} USDC...`);
      try {
        const r = await this.executeA2ACommerceDirect(wallets, decision.amount);
        txHash = r.txHash;
        executionResult.execution = r;
      } catch (err: any) {
        this.logger.error(`  [AI Execute Failed] Giao dịch A2A thất bại: ${err.message}`);
        executionResult.error = err.message;
      }
    } else {
      this.logger.info(`  [AI Execute] Giữ nguyên vị thế, không thực hiện hành động.`);
    }

    return {
      state,
      decision,
      executionResult,
      txHash,
      executedAt: new Date().toISOString()
    };
  }

  private saveOnceState(): void {
    const f = path.resolve(`./runtime/${this.workerId}/state/once-tasks.json`);
    fs.writeFileSync(f, JSON.stringify({ completed: [...this.completedOnce] }, null, 2));
  }
}
