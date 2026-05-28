/**
 * payment-handler.ts
 * Xử lý ERC-8183 job lifecycle và nanopayments trên Arc testnet
 * Flow: createJob → setBudget → approve USDC → fund → submit → complete
 */

import {
  createPublicClient,
  http,
  decodeEventLog,
  formatUnits,
  parseUnits,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { arcTestnet } from "viem/chains";
import { WalletManager, type WalletPair } from "./wallet-manager.js";
import { Logger } from "./logger.js";
import fs from "fs";
import path from "path";

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENTIC_COMMERCE_CONTRACT =
  "0x0747EEf0706327138c69792bF28Cd525089e4583" as Address;
const USDC_CONTRACT = "0x3600000000000000000000000000000000000000" as Address;

export const JOB_STATUS = [
  "Open",
  "Funded",
  "Submitted",
  "Completed",
  "Rejected",
  "Expired",
] as const;

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const AGENTIC_COMMERCE_ABI = [
  {
    name: "createJob",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "expiredAt", type: "uint256" },
      { name: "description", type: "string" },
      { name: "hook", type: "address" },
    ],
    outputs: [{ name: "jobId", type: "uint256" }],
  },
  {
    name: "setBudget",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "fund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "submit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "deliverable", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "complete",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "getJob",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "client", type: "address" },
          { name: "provider", type: "address" },
          { name: "evaluator", type: "address" },
          { name: "description", type: "string" },
          { name: "budget", type: "uint256" },
          { name: "expiredAt", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "hook", type: "address" },
        ],
      },
    ],
  },
  {
    name: "JobCreated",
    type: "event",
    anonymous: false,
    inputs: [
      { indexed: true, name: "jobId", type: "uint256" },
      { indexed: true, name: "client", type: "address" },
      { indexed: true, name: "provider", type: "address" },
      { indexed: false, name: "evaluator", type: "address" },
      { indexed: false, name: "expiredAt", type: "uint256" },
      { indexed: false, name: "hook", type: "address" },
    ],
  },
] as const;

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JobResult {
  jobId: string;
  status: string;
  budget: string;
  txHashes: {
    createJob?: string;
    setBudget?: string;
    approve?: string;
    fund?: string;
    submit?: string;
    complete?: string;
  };
  deliverableHash: string;
  completedAt: string;
}

// ─── PaymentHandler Class ─────────────────────────────────────────────────────

export class PaymentHandler {
  private walletManager: WalletManager;
  private publicClient: ReturnType<typeof createPublicClient>;
  private logger: Logger;
  private txDir: string;

  constructor(walletManager: WalletManager, workerId: string = "worker-01") {
    this.walletManager = walletManager;
    this.publicClient = walletManager.getPublicClient() as any;
    this.logger = new Logger("PaymentHandler");
    this.txDir = path.resolve(`./runtime/${workerId}/transactions`);
    fs.mkdirSync(this.txDir, { recursive: true });
  }

  // ── Full ERC-8183 job lifecycle ────────────────────────────────────────────

  async runJobLifecycle(
    wallets: WalletPair,
    description: string,
    budgetUsdc: number = 5
  ): Promise<JobResult> {
    this.logger.info(`Starting ERC-8183 job lifecycle...`);
    this.logger.info(`  Client:   ${wallets.owner.address}`);
    this.logger.info(`  Provider: ${wallets.validator.address}`);
    this.logger.info(`  Budget:   ${budgetUsdc} USDC`);

    const jobBudget = parseUnits(budgetUsdc.toString(), 6);
    const txHashes: JobResult["txHashes"] = {};

    // Step 1: Create job
    this.logger.info("\n[1/6] Creating job...");
    const block = await this.publicClient.getBlock();
    const expiredAt = (block.timestamp + 3600n).toString();

    const createJobTxHash = await this.walletManager.executeContract(
      wallets.owner.address,
      AGENTIC_COMMERCE_CONTRACT,
      "createJob(address,address,uint256,string,address)",
      [
        wallets.validator.address,
        wallets.owner.address,
        expiredAt,
        description,
        "0x0000000000000000000000000000000000000000",
      ],
      "createJob"
    );
    txHashes.createJob = createJobTxHash;

    // Extract jobId from event
    const jobId = await this.extractJobId(createJobTxHash as Hex);
    this.logger.info(`  Job ID: ${jobId}`);

    // Step 2: Set budget (provider)
    this.logger.info("\n[2/6] Setting budget...");
    const setBudgetTxHash = await this.walletManager.executeContract(
      wallets.validator.address,
      AGENTIC_COMMERCE_CONTRACT,
      "setBudget(uint256,uint256,bytes)",
      [jobId.toString(), jobBudget.toString(), "0x"],
      "setBudget"
    );
    txHashes.setBudget = setBudgetTxHash;

    // Step 3: Approve USDC (client)
    this.logger.info("\n[3/6] Approving USDC...");
    const approveTxHash = await this.walletManager.executeContract(
      wallets.owner.address,
      USDC_CONTRACT,
      "approve(address,uint256)",
      [AGENTIC_COMMERCE_CONTRACT, jobBudget.toString()],
      "approve USDC"
    );
    txHashes.approve = approveTxHash;

    // Step 4: Fund escrow (client)
    this.logger.info("\n[4/6] Funding escrow...");
    const fundTxHash = await this.walletManager.executeContract(
      wallets.owner.address,
      AGENTIC_COMMERCE_CONTRACT,
      "fund(uint256,bytes)",
      [jobId.toString(), "0x"],
      "fund escrow"
    );
    txHashes.fund = fundTxHash;

    // Step 5: Submit deliverable (provider)
    this.logger.info("\n[5/6] Submitting deliverable...");
    const deliverableContent = `arc-worker-${Date.now()}-task-complete`;
    const deliverableHash = keccak256(toHex(deliverableContent));

    const submitTxHash = await this.walletManager.executeContract(
      wallets.validator.address,
      AGENTIC_COMMERCE_CONTRACT,
      "submit(uint256,bytes32,bytes)",
      [jobId.toString(), deliverableHash, "0x"],
      "submit deliverable"
    );
    txHashes.submit = submitTxHash;

    // Step 6: Complete job (evaluator = client)
    this.logger.info("\n[6/6] Completing job...");
    const reasonHash = keccak256(toHex("deliverable-approved"));

    const completeTxHash = await this.walletManager.executeContract(
      wallets.owner.address,
      AGENTIC_COMMERCE_CONTRACT,
      "complete(uint256,bytes32,bytes)",
      [jobId.toString(), reasonHash, "0x"],
      "complete job"
    );
    txHashes.complete = completeTxHash;

    // Read final state
    const job = await this.publicClient.readContract({
      address: AGENTIC_COMMERCE_CONTRACT,
      abi: AGENTIC_COMMERCE_ABI,
      functionName: "getJob",
      args: [jobId],
    });

    const result: JobResult = {
      jobId: jobId.toString(),
      status: JOB_STATUS[Number(job.status)],
      budget: formatUnits(job.budget, 6) + " USDC",
      txHashes,
      deliverableHash,
      completedAt: new Date().toISOString(),
    };

    this.saveJobResult(result);
    this.logger.info(`\n✅ Job #${result.jobId} completed - Status: ${result.status}`);

    return result;
  }

  // ── Extract jobId from JobCreated event ───────────────────────────────────

  private async extractJobId(txHash: Hex): Promise<bigint> {
    const receipt = await this.publicClient.getTransactionReceipt({ hash: txHash });

    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: AGENTIC_COMMERCE_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "JobCreated") {
          return decoded.args.jobId;
        }
      } catch {
        continue;
      }
    }

    throw new Error("Could not parse JobCreated event from tx: " + txHash);
  }

  // ── Get job state from contract ────────────────────────────────────────────

  async getJobState(jobId: bigint) {
    const job = await this.publicClient.readContract({
      address: AGENTIC_COMMERCE_CONTRACT,
      abi: AGENTIC_COMMERCE_ABI,
      functionName: "getJob",
      args: [jobId],
    });

    return {
      id: job.id.toString(),
      client: job.client,
      provider: job.provider,
      evaluator: job.evaluator,
      description: job.description,
      budget: formatUnits(job.budget, 6) + " USDC",
      expiredAt: new Date(Number(job.expiredAt) * 1000).toISOString(),
      status: JOB_STATUS[Number(job.status)],
      hook: job.hook,
    };
  }

  // ── Save job result to transactions dir ───────────────────────────────────

  private saveJobResult(result: JobResult): void {
    const filename = `job-${result.jobId}-${Date.now()}.json`;
    const filepath = path.join(this.txDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
    this.logger.info(`  Saved: ${filepath}`);
  }

  // ── Print job summary ─────────────────────────────────────────────────────

  printJobSummary(result: JobResult): void {
    console.log("\n" + "─".repeat(50));
    console.log("  JOB SUMMARY");
    console.log("─".repeat(50));
    console.log(`  Job ID:     ${result.jobId}`);
    console.log(`  Status:     ${result.status}`);
    console.log(`  Budget:     ${result.budget}`);
    console.log(`  Deliverable: ${result.deliverableHash}`);
    console.log(`  Completed:  ${result.completedAt}`);
    console.log("\n  Transactions:");
    for (const [key, hash] of Object.entries(result.txHashes)) {
      if (hash) {
        console.log(`    ${key.padEnd(12)}: https://testnet.arcscan.app/tx/${hash}`);
      }
    }
    console.log("─".repeat(50));
  }
}
