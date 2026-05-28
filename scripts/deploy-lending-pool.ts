/**
 * deploy-lending-pool.ts
 * Biên dịch và deploy contract AgenticLendingPool lên Arc Testnet
 */

import fs from "fs";
import path from "path";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
// @ts-ignore
import solc from "solc";

const USDC_CONTRACT = "0x3600000000000000000000000000000000000000";
const EURC_CONTRACT = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

async function main() {
  console.log("=== COMPILING AGENTIC LENDING POOL ===");

  const contractPath = path.resolve("./contracts/AgenticLendingPool.sol");
  if (!fs.existsSync(contractPath)) {
    throw new Error(`Solidity file not found at ${contractPath}`);
  }

  const source = fs.readFileSync(contractPath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      "AgenticLendingPool.sol": {
        content: source,
      },
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  console.log("Compiling with solc...");
  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    let hasError = false;
    for (const error of output.errors) {
      console.error(error.formattedMessage);
      if (error.severity === "error") {
        hasError = true;
      }
    }
    if (hasError) {
      throw new Error("Solidity compilation failed.");
    }
  }

  const contractOutput = output.contracts["AgenticLendingPool.sol"]["AgenticLendingPool"];
  const abi = contractOutput.abi;
  const bytecode = contractOutput.evm.bytecode.object;

  console.log("✓ Contract compiled successfully!");

  // Save ABI for UI and bot task manager usage
  const abiDir = path.resolve("./runtime/worker-01/state");
  fs.mkdirSync(abiDir, { recursive: true });
  fs.writeFileSync(
    path.join(abiDir, "LendingPoolABI.json"),
    JSON.stringify(abi, null, 2)
  );
  console.log(`✓ Saved ABI to runtime/worker-01/state/LendingPoolABI.json`);

  // Load private key of nanopay local wallet
  const walletFile = path.join(abiDir, "nanopay-wallet.json");
  if (!fs.existsSync(walletFile)) {
    throw new Error(`nanopay-wallet.json not found at ${walletFile}. Please run the bot first to generate it.`);
  }

  const walletState = JSON.parse(fs.readFileSync(walletFile, "utf8"));
  const privateKey = walletState.privateKey as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  console.log(`Deployer address: ${account.address}`);

  const rpcUrl = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
  
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(rpcUrl),
  });

  console.log("Deploying contract to Arc Testnet...");
  
  // Deploy the contract
  const hash = await walletClient.deployContract({
    abi,
    bytecode: `0x${bytecode}`,
    args: [USDC_CONTRACT, EURC_CONTRACT],
  });

  console.log(`Transaction sent! Hash: ${hash}`);
  console.log("Waiting for confirmation (usually <1 second on Arc)...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const contractAddress = receipt.contractAddress;

  if (!contractAddress) {
    throw new Error("Failed to retrieve deployed contract address.");
  }

  console.log(`\n=========================================`);
  console.log(`✅ AgenticLendingPool deployed successfully!`);
  console.log(`Address: ${contractAddress}`);
  console.log(`Tx: https://testnet.arcscan.app/tx/${hash}`);
  console.log(`=========================================\n`);

  // Save address to contracts config
  const contractsConfigPath = path.join(abiDir, "contracts.json");
  let contractsConfig: any = {};
  if (fs.existsSync(contractsConfigPath)) {
    try {
      contractsConfig = JSON.parse(fs.readFileSync(contractsConfigPath, "utf8"));
    } catch {}
  }
  
  contractsConfig["lending_pool"] = contractAddress;
  fs.writeFileSync(contractsConfigPath, JSON.stringify(contractsConfig, null, 2));
  console.log(`✓ Saved address to runtime/worker-01/state/contracts.json`);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
