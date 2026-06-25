/**
 * wallet-manager.ts
 * Quản lý Circle Developer-Controlled Wallets cho Arc worker bot
 * Handles: create, fund check, transfer, balance query
 */

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { createPublicClient, http, fallback, formatUnits, type Address, encodeFunctionData, keccak256, stringToHex, parseUnits, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import fs from "fs";
import path from "path";
import { AppKit } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";

// ─── Constants ───────────────────────────────────────────────────────────────

const USDC_CONTRACT = "0x3600000000000000000000000000000000000000" as Address;
const USDC_DECIMALS = 6;
const EURC_CONTRACT = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address;
const CIRBTC_CONTRACT = "0xf0c4a4ce82a5746abaad9425360ab04fbba432bf" as Address;

const USDC_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletInfo {
  id: string;
  address: string;
  label: string;
  walletSetId: string;
  blockchain: string;
}

export interface WalletBalance {
  walletId: string;
  address: string;
  usdc: string;
  usdcRaw: bigint;
}

export interface WalletPair {
  owner: WalletInfo;
  validator: WalletInfo;
  walletSetId: string;
}

// ─── WalletManager Class ──────────────────────────────────────────────────────

export class WalletManager {
  private circleClient: ReturnType<typeof initiateDeveloperControlledWalletsClient>;
  private circleAppKit: AppKit;
  private publicClient: ReturnType<typeof createPublicClient>;
  private workerId: string;
  private stateDir: string;

  constructor(workerId: string = "worker-01") {
    const apiKey = process.env.CIRCLE_API_KEY;
    const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

    if (!apiKey || !entitySecret) {
      throw new Error(
        "Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET in environment"
      );
    }

    const apisPath = path.resolve("./config/apis.json");
    let rpcUrls: string[] = ["https://rpc.testnet.arc.network"];
    if (fs.existsSync(apisPath)) {
      try {
        const apis = JSON.parse(fs.readFileSync(apisPath, "utf-8"));
        if (apis.arc && apis.arc.rpc_urls) {
          rpcUrls = apis.arc.rpc_urls;
        } else if (apis.arc && apis.arc.rpc) {
          rpcUrls = [apis.arc.rpc];
        }
      } catch {}
    }

    if (process.env.ARC_RPC_URL) {
      rpcUrls = [process.env.ARC_RPC_URL];
    }

    this.circleClient = initiateDeveloperControlledWalletsClient({
      apiKey,
      entitySecret,
    });

    this.circleAppKit = new AppKit();

    this.publicClient = createPublicClient({
      chain: arcTestnet,
      transport: fallback(rpcUrls.map((url) => http(url))),
    });

    this.workerId = workerId;
    this.stateDir = path.resolve(`./runtime/${workerId}/state`);
    fs.mkdirSync(this.stateDir, { recursive: true });
  }

  // ── Create wallet pair (owner + validator) ─────────────────────────────────

  async createWalletPair(name?: string): Promise<WalletPair> {
    const setName = name || `Arc Worker Bot - ${this.workerId}`;
    console.log(`  Creating wallet set: "${setName}"...`);

    const walletSet = await this.circleClient.createWalletSet({ name: setName });
    const walletSetId = walletSet.data?.walletSet?.id;
    if (!walletSetId) throw new Error("Failed to create wallet set");

    const walletsResponse = await this.circleClient.createWallets({
      blockchains: ["ARC-TESTNET"],
      count: 2,
      walletSetId,
      accountType: "SCA",
    });

    const wallets = walletsResponse.data?.wallets;
    if (!wallets || wallets.length < 2) {
      throw new Error("Failed to create wallets");
    }

    const pair: WalletPair = {
      owner: {
        id: wallets[0].id!,
        address: wallets[0].address!,
        label: "owner",
        walletSetId,
        blockchain: "ARC-TESTNET",
      },
      validator: {
        id: wallets[1].id!,
        address: wallets[1].address!,
        label: "validator",
        walletSetId,
        blockchain: "ARC-TESTNET",
      },
      walletSetId,
    };

    // Persist to state
    this.saveWalletState(pair);

    console.log(`  ✓ Owner wallet:     ${pair.owner.address}`);
    console.log(`  ✓ Validator wallet: ${pair.validator.address}`);

    return pair;
  }

  // ── Load existing wallets from state ──────────────────────────────────────

  loadWalletState(): WalletPair | null {
    const stateFile = path.join(this.stateDir, "wallets.json");
    if (!fs.existsSync(stateFile)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
      return data as WalletPair;
    } catch {
      return null;
    }
  }

  // ── Save wallet state ─────────────────────────────────────────────────────

  private saveWalletState(pair: WalletPair): void {
    const stateFile = path.join(this.stateDir, "wallets.json");
    fs.writeFileSync(stateFile, JSON.stringify(pair, null, 2));
  }

  // ── Get or create wallet pair ─────────────────────────────────────────────

  async getOrCreateWallets(): Promise<WalletPair> {
    const existing = this.loadWalletState();
    if (existing) {
      console.log(`  Loaded existing wallets from state`);
      console.log(`  Owner:     ${existing.owner.address}`);
      console.log(`  Validator: ${existing.validator.address}`);
      return existing;
    }
    return this.createWalletPair();
  }

  // ── Get USDC balance via RPC ───────────────────────────────────────────────

  async getUSDCBalance(address: string): Promise<WalletBalance> {
    const raw = await this.publicClient.readContract({
      address: USDC_CONTRACT,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [address as Address],
    });

    return {
      walletId: "",
      address,
      usdc: formatUnits(raw, USDC_DECIMALS),
      usdcRaw: raw,
    };
  }

  // ── Get balance via Circle API ─────────────────────────────────────────────

  async getCircleBalance(walletId: string, address: string): Promise<WalletBalance> {
    try {
      const resp = await this.circleClient.getWalletTokenBalance({ id: walletId });
      const balances = resp.data?.tokenBalances || [];
      const usdc = balances.find((b: any) => b.token?.symbol === "USDC");
      const amount = usdc?.amount || "0";

      return {
        walletId,
        address,
        usdc: amount,
        usdcRaw: BigInt(Math.round(parseFloat(amount) * 10 ** USDC_DECIMALS)),
      };
    } catch {
      // Fallback to RPC
      return this.getUSDCBalance(address);
    }
  }

  // ── Print balances ─────────────────────────────────────────────────────────

  async printBalances(pair: WalletPair): Promise<void> {
    const ownerBal = await this.getUSDCBalance(pair.owner.address);
    const validatorBal = await this.getUSDCBalance(pair.validator.address);

    console.log(`  Owner     (${pair.owner.address}): ${ownerBal.usdc} USDC`);
    console.log(`  Validator (${pair.validator.address}): ${validatorBal.usdc} USDC`);
  }

  // ── Transfer Token (generic) ──────────────────────────────────────────────
  
  async transferToken(
    fromWalletId: string,
    fromAddress: string,
    toAddress: string,
    amount: string,
    tokenAddress: string,
    tokenSymbol: string
  ): Promise<string> {
    console.log(`  Transferring ${amount} ${tokenSymbol} → ${toAddress}...`);

    const tx = await this.circleClient.createTransaction({
      walletAddress: fromAddress,
      blockchain: "ARC-TESTNET",
      tokenAddress,
      destinationAddress: toAddress,
      amount: [amount],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });

    const txId = tx.data?.id;
    if (!txId) throw new Error(`Failed to initiate ${tokenSymbol} transfer`);

    return this.waitForTx(txId, `transfer ${amount} ${tokenSymbol}`);
  }

  // ── Initiate Transfer without awaiting confirmation (for batch demo) ───────

  async initiateTransferToken(
    fromAddress: string,
    toAddress: string,
    amount: string,
    tokenAddress: string
  ): Promise<string> {
    const tx = await this.circleClient.createTransaction({
      walletAddress: fromAddress,
      blockchain: "ARC-TESTNET",
      tokenAddress,
      destinationAddress: toAddress,
      amount: [amount],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });

    const txId = tx.data?.id;
    if (!txId) throw new Error("Failed to initiate transfer");
    return txId;
  }

  async initiateTransferUSDC(
    fromAddress: string,
    toAddress: string,
    amount: string
  ): Promise<string> {
    return this.initiateTransferToken(fromAddress, toAddress, amount, USDC_CONTRACT);
  }

  // ── Transfer USDC between wallets ─────────────────────────────────────────

  async transferUSDC(
    fromWalletId: string,
    fromAddress: string,
    toAddress: string,
    amount: string
  ): Promise<string> {
    return this.transferToken(fromWalletId, fromAddress, toAddress, amount, USDC_CONTRACT, "USDC");
  }

  // ── Transfer USDC with Transaction Memo ────────────────────────────────────

  async transferUSDCWithMemo(
    fromWalletId: string,
    fromAddress: string,
    toAddress: string,
    amount: string,
    memoText: string,
    memoIdText: string
  ): Promise<string> {
    const walletStateDir = path.resolve(`./runtime/${this.workerId}/state`);
    const localWalletFile = path.join(walletStateDir, "nanopay-wallet.json");

    if (!fs.existsSync(localWalletFile)) {
      throw new Error("Local nanopay wallet not initialized. Run nanopayment task first.");
    }

    const state = JSON.parse(fs.readFileSync(localWalletFile, "utf-8"));
    const privateKey = state.privateKey;
    const account = privateKeyToAccount(privateKey);
    const localAddress = account.address;

    // Check EOA balance
    const eoaBal = await this.getUSDCBalance(localAddress);
    const amountVal = parseFloat(amount);
    
    // Auto-fund EOA if balance is low (< amount + 1 USDC)
    if (parseFloat(eoaBal.usdc) < amountVal + 1.0) {
      console.log(`  [Memo Refuel] EOA balance low (${eoaBal.usdc} USDC). Funding 5.00 USDC from Circle owner...`);
      await this.transferUSDC(fromWalletId, fromAddress, localAddress, "5.00");
      // Wait for confirmation
      await new Promise(r => setTimeout(r, 5000));
    }

    console.log(`  Transferring ${amount} USDC from EOA ${localAddress} → ${toAddress} with memo: "${memoText}"...`);

    const memoAddress = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505";
    const transferData = encodeFunctionData({
      abi: [
        {
          name: "transfer",
          type: "function",
          stateMutability: "nonpayable",
          inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
        },
      ],
      functionName: "transfer",
      args: [toAddress as Address, parseUnits(amount, USDC_DECIMALS)],
    });

    const memoId = keccak256(stringToHex(memoIdText));
    const memoBytes = stringToHex(memoText);

    // Call Memo contract from EOA using viem walletClient
    const apisPath = path.resolve("./config/apis.json");
    let rpcUrls: string[] = ["https://rpc.testnet.arc.network"];
    if (fs.existsSync(apisPath)) {
      try {
        const apis = JSON.parse(fs.readFileSync(apisPath, "utf-8"));
        if (apis.arc && apis.arc.rpc_urls) {
          rpcUrls = apis.arc.rpc_urls;
        } else if (apis.arc && apis.arc.rpc) {
          rpcUrls = [apis.arc.rpc];
        }
      } catch {}
    }
    if (process.env.ARC_RPC_URL) {
      rpcUrls = [process.env.ARC_RPC_URL];
    }

    const walletClient = createWalletClient({
      account,
      chain: arcTestnet,
      transport: fallback(rpcUrls.map((url) => http(url))),
    });

    const hash = await walletClient.writeContract({
      address: memoAddress,
      abi: [
        {
          type: "function",
          name: "memo",
          stateMutability: "nonpayable",
          inputs: [
            { name: "target", type: "address" },
            { name: "data", type: "bytes" },
            { name: "memoId", type: "bytes32" },
            { name: "memoData", type: "bytes" }
          ],
          outputs: []
        }
      ],
      functionName: "memo",
      args: [USDC_CONTRACT, transferData, memoId, memoBytes],
    });

    // Wait for transaction confirmation
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`Memo transaction reverted: ${hash}`);
    }

    return hash;
  }

  // ── Transfer EURC between wallets ─────────────────────────────────────────

  async transferEURC(
    fromWalletId: string,
    fromAddress: string,
    toAddress: string,
    amount: string
  ): Promise<string> {
    return this.transferToken(fromWalletId, fromAddress, toAddress, amount, EURC_CONTRACT, "EURC");
  }

  // ── Transfer cirBTC between wallets ───────────────────────────────────────

  async transferCIRBTC(
    fromWalletId: string,
    fromAddress: string,
    toAddress: string,
    amount: string
  ): Promise<string> {
    return this.transferToken(fromWalletId, fromAddress, toAddress, amount, CIRBTC_CONTRACT, "cirBTC");
  }

  // ── CCTP Bridge USDC from Arc Testnet to other chains ──────────────────────

  async bridgeUSDC(
    fromWalletId: string,
    fromAddress: string,
    toAddress: string,
    amount: string,
    destChain: string = "Base_Sepolia"
  ): Promise<any> {
    console.log(`  Bridging ${amount} USDC from Arc_Testnet → ${destChain} (${toAddress})...`);
    const apiKey = process.env.CIRCLE_API_KEY!;
    const entitySecret = process.env.CIRCLE_ENTITY_SECRET!;

    const adapter = createCircleWalletsAdapter({
      apiKey,
      entitySecret,
    });

    const result = await this.circleAppKit.bridge({
      from: {
        adapter,
        chain: "Arc_Testnet",
        address: fromAddress,
      },
      to: {
        recipientAddress: toAddress,
        chain: destChain as any,
        useForwarder: true,
      },
      amount,
    });

    if (result.state === "error") {
      const failedStep = result.steps.find((step) => step.state === "error");
      throw new Error(`CCTP Bridge failed at step ${failedStep?.name || "unknown"}: ${failedStep?.error || "unknown error"}`);
    }

    return result;
  }

  // ── Swap tokens on Arc Testnet ─────────────────────────────────────────────

  async swapToken(
    fromWalletId: string,
    fromAddress: string,
    amount: string,
    tokenIn: string = "USDC",
    tokenOut: string = "EURC"
  ): Promise<any> {
    console.log(`  Swapping ${amount} ${tokenIn} → ${tokenOut} on Arc_Testnet...`);
    const apiKey = process.env.CIRCLE_API_KEY!;
    const entitySecret = process.env.CIRCLE_ENTITY_SECRET!;
    const kitKey = process.env.KIT_KEY;

    if (!kitKey) {
      throw new Error("Missing KIT_KEY in environment variables. Cannot perform Swap.");
    }

    const adapter = createCircleWalletsAdapter({
      apiKey,
      entitySecret,
    });

    const result = await this.circleAppKit.swap({
      from: {
        adapter,
        chain: "Arc_Testnet",
        address: fromAddress,
      },
      tokenIn: tokenIn as any,
      tokenOut: tokenOut as any,
      amountIn: amount,
      config: {
        kitKey,
        slippageBps: 300, // 3% slippage tolerance
      },
    });

    return result;
  }

  // ── Execute contract call ─────────────────────────────────────────────────

  async executeContract(
    walletAddress: string,
    contractAddress: string,
    abiFunctionSignature: string,
    abiParameters: string[],
    label: string
  ): Promise<string> {
    const tx = await this.circleClient.createContractExecutionTransaction({
      walletAddress,
      blockchain: "ARC-TESTNET",
      contractAddress,
      abiFunctionSignature,
      abiParameters,
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });

    const txId = tx.data?.id;
    if (!txId) throw new Error(`Failed to initiate: ${label}`);

    return this.waitForTx(txId, label);
  }

  // ── Poll transaction until confirmed ─────────────────────────────────────

  async waitForTx(txId: string, label: string, maxRetries = 60): Promise<string> {
    process.stdout.write(`  ⏳ ${label}`);

    for (let i = 0; i < maxRetries; i++) {
      await sleep(2000);
      const { data } = await this.circleClient.getTransaction({ id: txId });
      const state = data?.transaction?.state;
      const txHash = data?.transaction?.txHash;

      if (state === "COMPLETE" && txHash) {
        console.log(` ✓`);
        console.log(`     tx: https://testnet.arcscan.app/tx/${txHash}`);
        return txHash;
      }

      if (state === "FAILED") {
        console.log(` ✗`);
        throw new Error(`Transaction failed: ${label}`);
      }

      process.stdout.write(".");
    }

    console.log(` TIMEOUT`);
    throw new Error(`Transaction timed out: ${label}`);
  }

  // ── Get public client ─────────────────────────────────────────────────────

  getPublicClient() {
    return this.publicClient;
  }

  // ── Get Circle client ─────────────────────────────────────────────────────

  getCircleClient() {
    return this.circleClient;
  }

  // ── Check if wallet needs funding ─────────────────────────────────────────

  async needsFunding(address: string, minUsdc: number = 2): Promise<boolean> {
    const bal = await this.getUSDCBalance(address);
    return parseFloat(bal.usdc) < minUsdc;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
