/**
 * scheduler.ts
 * Main entry point - Arc Worker Bot scheduler
 * Khởi động worker, load tasks, chạy polling loop
 *
 * Usage:
 *   npm start                    # chạy worker mặc định (worker-01)
 *   WORKER_ID=worker-01 npm start
 */

import fs from "fs";
import path from "path";
import http from "http";
import { formatUnits, type Address } from "viem";
import { WalletManager } from "./wallet-manager.js";
import { PaymentHandler } from "./payment-handler.js";
import { TaskExecutor, LENDING_POOL_ABI, type Task, type TaskResult } from "./task-executor.js";
import { Logger } from "./logger.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const WORKER_ID = process.env.WORKER_ID || "worker-01";
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "30000");
const AUTO_RESTART = process.env.AUTO_RESTART !== "false";
const RESTART_DELAY_MS = parseInt(process.env.RESTART_DELAY_MS || "10000");

// ─── Scheduler Class ──────────────────────────────────────────────────────────

class Scheduler {
  private logger: Logger;
  private walletManager: WalletManager;
  private paymentHandler: PaymentHandler;
  private taskExecutor: TaskExecutor;
  private running: boolean = false;
  private pollCount: number = 0;
  private startTime: Date;
  private triggerRequested: boolean = false;
  private logBuffer: string[] = [];
  private resultsHistory: TaskResult[] = [];

  constructor() {
    this.logger = new Logger("Scheduler");
    this.startTime = new Date();

    // Hook console.log to buffer lines for Web UI
    const originalLog = console.log;
    const self = this;
    console.log = function (...args: any[]) {
      originalLog.apply(console, args);
      const line = args
        .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
        .join(" ");
      const cleanLine = line.replace(
        /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
        ""
      );
      self.logBuffer.push(cleanLine);
      if (self.logBuffer.length > 500) self.logBuffer.shift();
    };

    this.walletManager = new WalletManager(WORKER_ID);
    this.paymentHandler = new PaymentHandler(this.walletManager, WORKER_ID);
    this.taskExecutor = new TaskExecutor(
      this.walletManager,
      this.paymentHandler,
      WORKER_ID
    );
  }

  // ── Load results history from disk ────────────────────────────────────────

  private loadResultsHistory(): void {
    try {
      const resultsDir = path.resolve(`./runtime/${WORKER_ID}/results`);
      if (!fs.existsSync(resultsDir)) {
        this.resultsHistory = [];
        return;
      }
      const files = fs.readdirSync(resultsDir)
        .filter((file) => file.endsWith(".json"));
      
      const filesWithTime = files.map((file) => {
        const filePath = path.join(resultsDir, file);
        try {
          const stats = fs.statSync(filePath);
          return { name: file, mtime: stats.mtimeMs };
        } catch {
          return { name: file, mtime: 0 };
        }
      });
      
      // Sort newest first
      filesWithTime.sort((a, b) => b.mtime - a.mtime);
      
      // Take the top 100 newest files to parse
      const newestFiles = filesWithTime.slice(0, 100);
      
      this.resultsHistory = [];
      for (const fileObj of newestFiles) {
        try {
          const content = fs.readFileSync(path.join(resultsDir, fileObj.name), "utf-8");
          const data = JSON.parse(content);
          this.resultsHistory.push(data);
        } catch {}
      }
      
      // Sort resultsHistory by executedAt descending just in case
      this.resultsHistory.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
      this.logger.info(`Loaded ${this.resultsHistory.length} task results into history memory.`);
    } catch (err: any) {
      this.logger.error(`Error loading results history: ${err.message}`);
      this.resultsHistory = [];
    }
  }

  // ── Load tasks from JSON ───────────────────────────────────────────────────

  private loadTasks(): Task[] {
    const taskFile = path.resolve(`./tasks/tasks-${WORKER_ID}.json`);
    if (!fs.existsSync(taskFile)) {
      throw new Error(`Task file not found: ${taskFile}`);
    }

    const raw = JSON.parse(fs.readFileSync(taskFile, "utf-8"));
    return raw.tasks as Task[];
  }

  // ── Load worker config ─────────────────────────────────────────────────────

  private loadWorkerConfig() {
    const configFile = path.resolve("./config/workers.json");
    const raw = JSON.parse(fs.readFileSync(configFile, "utf-8"));
    const worker = raw.workers.find((w: any) => w.id === WORKER_ID);
    if (!worker) throw new Error(`Worker config not found: ${WORKER_ID}`);
    return worker;
  }

  // ── Print startup banner ───────────────────────────────────────────────────

  private printBanner(config: any): void {
    console.log("\n" + "═".repeat(55));
    console.log("  ⚡  ARC WORKER BOT");
    console.log("═".repeat(55));
    console.log(`  Worker ID  : ${WORKER_ID}`);
    console.log(`  Name       : ${config.name}`);
    console.log(`  Poll every : ${POLL_INTERVAL_MS / 1000}s`);
    console.log(`  Started    : ${this.startTime.toISOString()}`);
    console.log(`  Network    : Arc Testnet (Chain ID: 5042002)`);
    console.log(`  Explorer   : https://testnet.arcscan.app`);
    console.log("═".repeat(55) + "\n");
  }

  // ── Write worker state ─────────────────────────────────────────────────────

  private writeState(status: string, extra: Record<string, any> = {}): void {
    const stateFile = path.resolve(`./runtime/${WORKER_ID}/state/worker.json`);
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify(
        {
          workerId: WORKER_ID,
          status,
          startTime: this.startTime.toISOString(),
          lastUpdate: new Date().toISOString(),
          pollCount: this.pollCount,
          ...extra,
        },
        null,
        2
      )
    );
  }

  // ── Main run loop ─────────────────────────────────────────────────────────

  async run(): Promise<void> {
    const config = this.loadWorkerConfig();
    this.printBanner(config);

    this.logger.section("INITIALIZATION");

    // Load results history once at startup
    this.loadResultsHistory();

    // Get or create wallets
    this.logger.info("Loading wallets...");
    const wallets = await this.walletManager.getOrCreateWallets();

    // Print balances
    this.logger.info("\nCurrent balances:");
    await this.walletManager.printBalances(wallets);

    // Check if owner has enough balance
    const needsFunding = await this.walletManager.needsFunding(
      wallets.owner.address,
      config.settings.min_balance_usdc
    );

    if (needsFunding) {
      this.logger.warn(
        `⚠️  Owner wallet balance below ${config.settings.min_balance_usdc} USDC`
      );
      this.logger.warn(`   Fund at: https://faucet.circle.com`);
      this.logger.warn(`   Address: ${wallets.owner.address}`);
    }

    // Load tasks
    const tasks = this.loadTasks();
    this.logger.info(`\nLoaded ${tasks.length} tasks from tasks-${WORKER_ID}.json`);
    tasks.forEach((t) => {
      const status = t.enabled ? "✓" : "✗";
      this.logger.info(`  ${status} [${t.id}] ${t.name} (${t.schedule})`);
    });

    this.writeState("running", {
      ownerAddress: wallets.owner.address,
      validatorAddress: wallets.validator.address,
    });

    // Start Dashboard API server
    this.startHttpServer();

    this.running = true;

    this.logger.section("POLLING LOOP STARTED");

    // Signal handlers
    process.on("SIGINT", () => this.stop("SIGINT"));
    process.on("SIGTERM", () => this.stop("SIGTERM"));

    // ── Main loop ──────────────────────────────────────────────────────────

    while (this.running) {
      this.pollCount++;
      const pollStart = Date.now();

      this.logger.info(
        `\n[Poll #${this.pollCount}] ${new Date().toISOString()}`
      );

      try {
        // Tự động kiểm tra và tiếp quỹ cho ví Validator nếu cần
        await this.checkAndRefuelValidator(wallets, config);

        const results = await this.taskExecutor.executeAll(tasks, wallets);

        // Add new results to results history
        this.resultsHistory.unshift(...results);
        if (this.resultsHistory.length > 150) {
          this.resultsHistory = this.resultsHistory.slice(0, 150);
        }

        const success = results.filter((r) => r.status === "success").length;
        const failed = results.filter((r) => r.status === "failed").length;
        const skipped = results.filter((r) => r.status === "skipped").length;

        this.logger.info(
          `  Done: ${success} success | ${failed} failed | ${skipped} skipped | ${Date.now() - pollStart}ms`
        );

        this.writeState("running", {
          ownerAddress: wallets.owner.address,
          validatorAddress: wallets.validator.address,
          lastPoll: new Date().toISOString(),
          lastResults: { success, failed, skipped },
        });
      } catch (err: any) {
        this.logger.error(`Poll error: ${err.message}`);
        this.writeState("error", { lastError: err.message });
      }

      if (!this.running) break;

      this.logger.info(`  Sleeping ${POLL_INTERVAL_MS / 1000}s...`);
      await this.sleepOrTrigger(POLL_INTERVAL_MS);
    }
  }

  // ── Auto-refuel validator wallet from owner ───────────────────────────────

  private async checkAndRefuelValidator(wallets: any, config: any): Promise<void> {
    const threshold = config.settings.auto_fund_threshold_usdc || 1;
    const refuelAmount = config.settings.refuel_amount_usdc || 2;

    this.logger.info(`Checking validator balance for refuel (threshold: ${threshold} USDC)...`);

    try {
      const validatorBal = await this.walletManager.getUSDCBalance(wallets.validator.address);
      const valUSDC = parseFloat(validatorBal.usdc);

      this.logger.info(`  Validator balance: ${valUSDC} USDC`);

      if (valUSDC < threshold) {
        this.logger.warn(`⚠️ Validator balance is below threshold! Initiating refuel...`);

        // Check owner balance
        const ownerBal = await this.walletManager.getUSDCBalance(wallets.owner.address);
        const ownerUSDC = parseFloat(ownerBal.usdc);

        if (ownerUSDC < refuelAmount + threshold) {
          this.logger.error(
            `❌ Cannot refuel validator: Owner wallet balance is too low (${ownerUSDC} USDC, need ${refuelAmount + threshold} USDC)`
          );
          return;
        }

        this.logger.info(`  Transferring ${refuelAmount} USDC from Owner to Validator...`);
        const txHash = await this.walletManager.transferUSDC(
          wallets.owner.id,
          wallets.owner.address,
          wallets.validator.address,
          refuelAmount.toString()
        );

        this.logger.success(`✅ Refueled validator successfully! Tx: ${txHash}`);
      }
    } catch (err: any) {
      this.logger.error(`Failed during auto-refuel check: ${err.message}`);
    }
  }

  // ── HTTP API Server & static server for Web UI ─────────────────────────────

  private startHttpServer(): void {
    const port = parseInt(process.env.PORT || "3000");
    const server = http.createServer(async (req, res) => {
      const url = req.url || "/";
      const method = req.method || "GET";

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // API: status
      if (url === "/api/status" && method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        const workerStatePath = path.resolve(`./runtime/${WORKER_ID}/state/worker.json`);
        const walletsPath = path.resolve(`./runtime/${WORKER_ID}/state/wallets.json`);
        
        let workerState: any = {};
        let wallets: any = {};
        
        try {
          if (fs.existsSync(workerStatePath)) workerState = JSON.parse(fs.readFileSync(workerStatePath, "utf-8"));
          if (fs.existsSync(walletsPath)) wallets = JSON.parse(fs.readFileSync(walletsPath, "utf-8"));
        } catch {}

        // Query Lending contract data if deployed
        let lendingData = null;
        try {
          const contractsPath = path.resolve(`./runtime/${WORKER_ID}/state/contracts.json`);
          if (fs.existsSync(contractsPath)) {
            const contracts = JSON.parse(fs.readFileSync(contractsPath, "utf-8"));
            const lendingPoolAddress = contracts.multi_collateral_pool || contracts.lending_pool;
            if (lendingPoolAddress && wallets.owner?.address) {
              const publicClient = this.taskExecutor.publicClient;
              const [collateralUSDC, collateralCirBTC, borrowedEURC, currentBtcPrice, totalCollateralUSD, maxBorrowEURC, healthFactor] = await publicClient.readContract({
                address: lendingPoolAddress as Address,
                abi: LENDING_POOL_ABI,
                functionName: "getAccountData",
                args: [wallets.owner.address as Address],
              }) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint];

              let reputation = 0n;
              let ltv = 80n;
              try {
                reputation = await publicClient.readContract({
                  address: lendingPoolAddress as Address,
                  abi: LENDING_POOL_ABI,
                  functionName: "userReputation",
                  args: [wallets.owner.address as Address],
                }) as bigint;
                ltv = await publicClient.readContract({
                  address: lendingPoolAddress as Address,
                  abi: LENDING_POOL_ABI,
                  functionName: "getUserLTV",
                  args: [wallets.owner.address as Address],
                }) as bigint;
              } catch {}
              
              const hf = Number(healthFactor);
              lendingData = {
                poolAddress: lendingPoolAddress,
                collateralUSDC: formatUnits(collateralUSDC, 6),
                collateralCirBTC: formatUnits(collateralCirBTC, 8),
                borrowedEURC: formatUnits(borrowedEURC, 6),
                currentBtcPrice: formatUnits(currentBtcPrice, 6),
                totalCollateralUSD: formatUnits(totalCollateralUSD, 6),
                maxBorrowEURC: formatUnits(maxBorrowEURC, 6),
                healthFactor: hf === 99999 ? "Safe" : (hf / 100).toFixed(2),
                reputation: Number(reputation),
                ltv: Number(ltv)
              };
            }
          }
        } catch (err: any) {
          this.logger.error(`Failed to fetch lending data for api status: ${err.message}`);
        }
        
        res.end(JSON.stringify({ ...workerState, ...wallets, lending: lendingData }));
        return;
      }

      // API: lending action
      if (url === "/api/lending/action" && method === "POST") {
        let bodyStr = "";
        req.on("data", (chunk) => { bodyStr += chunk; });
        req.on("end", async () => {
          try {
            const body = JSON.parse(bodyStr);
            const { action, amount, token } = body;
            if (!action || !amount) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "Missing action or amount" }));
              return;
            }

            const walletsPath = path.resolve(`./runtime/${WORKER_ID}/state/wallets.json`);
            if (!fs.existsSync(walletsPath)) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "Wallets not initialized" }));
              return;
            }
            const wallets = JSON.parse(fs.readFileSync(walletsPath, "utf-8"));

            this.logger.info(`[UI Request] Manual Lending action triggered: ${action} ${amount} ${token || "USDC"}`);
            
            const manualTask: Task = {
              id: `manual-lending-${Date.now()}`,
              name: `Manual UI ${action}`,
              type: "lending_borrowing",
              description: `Manual UI initiated ${action} of ${amount} ${token || "USDC"}`,
              enabled: true,
              schedule: "manual",
              priority: 10,
              params: { action, amount, token },
              deliverable: { type: "json", hash_content: false }
            };

            const result = await this.taskExecutor.executeTask(manualTask, wallets);
            
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
          } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }

      // API: Simulated Oracle price update
      if (url === "/api/lending/oracle" && method === "POST") {
        let bodyStr = "";
        req.on("data", (chunk) => { bodyStr += chunk; });
        req.on("end", async () => {
          try {
            const body = JSON.parse(bodyStr);
            const { price } = body; // Price in USD, e.g. 60000 or 90000
            if (!price) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "Missing price parameter" }));
              return;
            }

            const contractsPath = path.resolve(`./runtime/${WORKER_ID}/state/contracts.json`);
            if (!fs.existsSync(contractsPath)) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "contracts.json not found" }));
              return;
            }
            const contracts = JSON.parse(fs.readFileSync(contractsPath, "utf-8"));
            const lendingPoolAddress = contracts.multi_collateral_pool;
            if (!lendingPoolAddress) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "Multi-Collateral Pool not deployed" }));
              return;
            }

            const walletsPath = path.resolve(`./runtime/${WORKER_ID}/state/wallets.json`);
            if (!fs.existsSync(walletsPath)) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "Wallets not initialized" }));
              return;
            }
            const wallets = JSON.parse(fs.readFileSync(walletsPath, "utf-8"));

            const priceRaw = BigInt(price) * 10n ** 6n;
            this.logger.info(`[UI Request] Simulating BTC price oracle update: $${price}`);

            const txHash = await this.walletManager.executeContract(
              wallets.owner.address,
              lendingPoolAddress,
              "setBTCPrice(uint256)",
              [priceRaw.toString()],
              "Update BTC Oracle Price"
            );

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, price: price.toString(), txHash }));
          } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }

      // API: Simulated Low USDC trigger
      if (url === "/api/lending/simulate-low-usdc" && method === "POST") {
        let bodyStr = "";
        req.on("data", (chunk) => { bodyStr += chunk; });
        req.on("end", async () => {
          try {
            const body = JSON.parse(bodyStr);
            const { mode } = body; // "deleverage" or "cctp"
            
            const simPath = path.resolve(`./runtime/${WORKER_ID}/state/simulate-low-usdc.json`);
            const simDir = path.dirname(simPath);
            fs.mkdirSync(simDir, { recursive: true });
            
            fs.writeFileSync(simPath, JSON.stringify({ active: true, mode: mode || "deleverage" }, null, 2));
            this.logger.info(`[UI Request] Simulating low USDC state for emergency auto-defense mode: ${mode || "deleverage"}`);

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, mode: mode || "deleverage" }));
          } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }

      // API: results
      if (url === "/api/results" && method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(this.resultsHistory));
        return;
      }

      // API: logs
      if (url === "/api/logs" && method === "GET") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(this.logBuffer.join("\n"));
        return;
      }

      // API: trigger poll
      if (url === "/api/trigger" && method === "POST") {
        this.triggerRequested = true;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "Kích hoạt polling thành công!" }));
        return;
      }

      // API: demo run (20 automated payments)
      if (url === "/api/demo/run" && method === "POST") {
        let bodyStr = "";
        req.on("data", (chunk) => { bodyStr += chunk; });
        req.on("end", async () => {
          try {
            const body = JSON.parse(bodyStr);
            const { walletAddress } = body;
            if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "Địa chỉ ví không hợp lệ" }));
              return;
            }

            const wallets = await this.walletManager.getOrCreateWallets();
            this.logger.info(`[Demo API] Initiating 20 automated payments of 0.0001 USDC to ${walletAddress}...`);
            
            const txIds: string[] = [];
            for (let i = 1; i <= 20; i++) {
              const txId = await this.walletManager.initiateTransferUSDC(
                wallets.owner.address,
                walletAddress,
                "0.0001"
              );
              txIds.push(txId);
              // Wait 150ms to avoid rate limit
              await new Promise(r => setTimeout(r, 150));
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, txIds }));
          } catch (err: any) {
            this.logger.error(`[Demo API Failed] ${err.message}`);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }

      // API: demo transaction status check
      if (url.startsWith("/api/demo/tx-status") && method === "GET") {
        try {
          const parsedUrl = new URL(url, `http://${req.headers.host || "localhost"}`);
          const idsParam = parsedUrl.searchParams.get("ids") || "";
          const ids = idsParam.split(",").filter(Boolean);

          const circleClient = this.walletManager.getCircleClient();
          const statuses: any[] = [];

          for (const id of ids) {
            try {
              const { data } = await circleClient.getTransaction({ id });
              statuses.push({
                id,
                state: data?.transaction?.state || "UNKNOWN",
                txHash: data?.transaction?.txHash || null,
              });
            } catch {
              statuses.push({ id, state: "ERROR", txHash: null });
            }
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, statuses }));
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
      }

      // Serve static assets from /public or task files
      let filePath = path.join(process.cwd(), "public", url === "/" ? "index.html" : url);
      
      if (url.startsWith("/tasks/")) {
        filePath = path.join(process.cwd(), url);
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        let contentType = "text/html";
        if (ext === ".css") contentType = "text/css";
        else if (ext === ".js") contentType = "application/javascript";
        else if (ext === ".json") contentType = "application/json";

        res.writeHead(200, { "Content-Type": contentType });
        res.end(fs.readFileSync(filePath));
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    });

    server.listen(port, () => {
      this.logger.success(`Dashboard Web UI available at http://localhost:${port}`);
    });
  }

  // ── Interruptible sleep ───────────────────────────────────────────────────

  private async sleepOrTrigger(ms: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (this.triggerRequested) {
        this.triggerRequested = false;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // ── Graceful stop ─────────────────────────────────────────────────────────

  private stop(signal: string): void {
    this.logger.warn(`\nReceived ${signal} — stopping worker...`);
    this.running = false;
    this.writeState("stopped");
    process.exit(0);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const scheduler = new Scheduler();

  try {
    await scheduler.run();
  } catch (err: any) {
    console.error(`\n[FATAL] ${err.message}`);

    if (AUTO_RESTART) {
      console.log(`\nAuto-restart in ${RESTART_DELAY_MS / 1000}s...`);
      await sleep(RESTART_DELAY_MS);
      await main(); // restart
    } else {
      process.exit(1);
    }
  }
}

main();
