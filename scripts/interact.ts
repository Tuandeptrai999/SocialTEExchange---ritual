import { ethers } from "hardhat";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  keccak256,
  toBytes,
  hexToBytes,
  toHex,
  parseEther,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { encrypt, ECIES_CONFIG } from "eciesjs";

// ─────────────────────────────────────────────
// MANDATORY: 12-byte nonce for Ritual secrets
// ─────────────────────────────────────────────
ECIES_CONFIG.symmetricNonceLength = 12;

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const EXCHANGE_ADDRESS = "0x99B688d84abe81800e3F3991Ad7Fe62aCdA40a6a";
const RITUAL_WALLET    = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948";
const TEE_REGISTRY     = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F";
const PRIVATE_KEY      = process.env.PRIVATE_KEY as `0x${string}`;

const ritualChain = defineChain({
  id: 1979,
  name: "Ritual",
  nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.ritualfoundation.org"] } },
});

// ─────────────────────────────────────────────
// ABIs (minimal)
// ─────────────────────────────────────────────
const EXCHANGE_ABI = [
  {
    name: "listCertificate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "executor",         type: "address"  },
      { name: "encryptedSecrets", type: "bytes[]"  },
      { name: "secretSignatures", type: "bytes[]"  },
      { name: "url",              type: "string"   },
      { name: "price",            type: "uint256"  },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "requestSocialData",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "certId", type: "uint256" },
      { name: "ttl",    type: "uint256" },
    ],
    outputs: [{ name: "status", type: "uint16" }, { name: "body", type: "bytes" }],
  },
  {
    name: "depositForFees",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "lockDuration", type: "uint256" }],
    outputs: [],
  },
  {
    name: "toggleCertificate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "certId", type: "uint256" }, { name: "active", type: "bool" }],
    outputs: [],
  },
  {
    name: "updatePrice",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "certId", type: "uint256" }, { name: "newPrice", type: "uint256" }],
    outputs: [],
  },
  {
    name: "certificates",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "seller",   type: "address" },
      { name: "executor", type: "address" },
      { name: "url",      type: "string"  },
      { name: "price",    type: "uint256" },
      { name: "active",   type: "bool"    },
    ],
  },
  {
    name: "nextCertId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const WALLET_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "lockUntil",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "deposit",
    type: "function",
    stateMutability: "payable",
    inputs:  [{ name: "lockDuration", type: "uint256" }],
    outputs: [],
  },
] as const;

const REGISTRY_ABI = [
  {
    name: "getServicesByCapability",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "capability",    type: "uint8" },
      { name: "checkValidity", type: "bool"  },
    ],
    outputs: [{
      type: "tuple[]",
      components: [
        { name: "node", type: "tuple", components: [
          { name: "paymentAddress", type: "address" },
          { name: "teeAddress",     type: "address" },
          { name: "teeType",        type: "uint8"   },
          { name: "publicKey",      type: "bytes"   },
          { name: "endpoint",       type: "string"  },
          { name: "certPubKeyHash", type: "bytes32" },
          { name: "capability",     type: "uint8"   },
        ]},
        { name: "isValid",    type: "bool"    },
        { name: "workloadId", type: "bytes32" },
      ],
    }],
  },
] as const;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
async function getClients() {
  const account      = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: ritualChain, transport: http() });
  const walletClient = createWalletClient({ account, chain: ritualChain, transport: http() });
  return { account, publicClient, walletClient };
}

async function getExecutor(publicClient: any) {
  const services = await publicClient.readContract({
    address:      TEE_REGISTRY as `0x${string}`,
    abi:          REGISTRY_ABI,
    functionName: "getServicesByCapability",
    args:         [0, true], // 0 = HTTP_CALL capability
  });
  if (!services || services.length === 0) throw new Error("No active HTTP executors found");
  const executor = services[0];
  console.log(`✅ Executor found: ${executor.node.teeAddress}`);
  return {
    address:   executor.node.teeAddress as `0x${string}`,
    publicKey: executor.node.publicKey  as `0x${string}`,
  };
}

// ─────────────────────────────────────────────
// 1. CHECK WALLET BALANCE
// ─────────────────────────────────────────────
async function checkBalance() {
  console.log("\n🔍 Checking RitualWallet balance...");
  const { account, publicClient } = await getClients();

  const balance   = await publicClient.readContract({ address: RITUAL_WALLET as `0x${string}`, abi: WALLET_ABI, functionName: "balanceOf",  args: [account.address] });
  const lockBlock = await publicClient.readContract({ address: RITUAL_WALLET as `0x${string}`, abi: WALLET_ABI, functionName: "lockUntil", args: [account.address] });
  const block     = await publicClient.getBlockNumber();

  console.log(`  Address  : ${account.address}`);
  console.log(`  Balance  : ${formatEther(balance as bigint)} RITUAL`);
  console.log(`  Lock until block: ${lockBlock} (current: ${block})`);
  console.log(`  Locked   : ${BigInt(block) < BigInt(lockBlock as bigint)}`);
}

// ─────────────────────────────────────────────
// 2. DEPOSIT FEES INTO RITUAL WALLET
// ─────────────────────────────────────────────
async function depositFees(amountEth = "0.05", lockBlocks = 10000n) {
  console.log(`\n💰 Depositing ${amountEth} RITUAL directly into RitualWallet (lock: ${lockBlocks} blocks)...`);
  const { walletClient, publicClient } = await getClients();

  const hash = await walletClient.writeContract({
    address:      RITUAL_WALLET as `0x${string}`,
    abi:          WALLET_ABI,
    functionName: "deposit",
    args:         [lockBlocks],
    value:        parseEther(amountEth),
  });

  console.log(`  TX sent: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
  return hash;
}

// ─────────────────────────────────────────────
// 3. LIST A SOCIAL API CERTIFICATE
// ─────────────────────────────────────────────
async function listCertificate(
  apiKey:  string,
  apiUrl:  string,
  priceEth = "0.001"
) {
  console.log(`\n📋 Listing certificate for: ${apiUrl}`);
  const { account, publicClient, walletClient } = await getClients();
  const executor = await getExecutor(publicClient);

  // Encrypt the API key with executor's public key
  const secretJson    = JSON.stringify({ API_KEY: apiKey });
  const pubKeyBytes   = Buffer.from(executor.publicKey.slice(2), "hex");
  const encryptedBuf  = encrypt(pubKeyBytes, Buffer.from(secretJson));
  const encryptedHex  = toHex(encryptedBuf) as `0x${string}`;
  const secretsHash   = keccak256(toBytes(encryptedHex));

  console.log(`  Secrets hash: ${secretsHash}`);

  // Sign the encrypted blob (EIP-191) — pass raw Uint8Array
  const signature = await walletClient.signMessage({
    account,
    message: { raw: new Uint8Array(encryptedBuf) },
  });

  const hash = await walletClient.writeContract({
    address:      EXCHANGE_ADDRESS as `0x${string}`,
    abi:          EXCHANGE_ABI,
    functionName: "listCertificate",
    args: [
      executor.address,
      [encryptedHex],
      [signature],
      apiUrl,
      parseEther(priceEth),
    ],
  });

  console.log(`  TX sent: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);

  // Get the cert ID from logs
  const nextId = await publicClient.readContract({
    address:      EXCHANGE_ADDRESS as `0x${string}`,
    abi:          EXCHANGE_ABI,
    functionName: "nextCertId",
  });
  const certId = BigInt(nextId as bigint) - 1n;
  console.log(`  🎫 Certificate ID: ${certId}`);
  return certId;
}

// ─────────────────────────────────────────────
// 4. VIEW A CERTIFICATE
// ─────────────────────────────────────────────
async function viewCertificate(certId: bigint) {
  console.log(`\n🔎 Viewing certificate #${certId}...`);
  const { publicClient } = await getClients();

  const cert = await publicClient.readContract({
    address:      EXCHANGE_ADDRESS as `0x${string}`,
    abi:          EXCHANGE_ABI,
    functionName: "certificates",
    args:         [certId],
  }) as [string, string, string, bigint, boolean];

  console.log(`  Seller  : ${cert[0]}`);
  console.log(`  Executor: ${cert[1]}`);
  console.log(`  URL     : ${cert[2]}`);
  console.log(`  Price   : ${formatEther(cert[3])} RITUAL`);
  console.log(`  Active  : ${cert[4]}`);
  return cert;
}

// ─────────────────────────────────────────────
// 5. BUY ACCESS & FETCH SOCIAL DATA
// ─────────────────────────────────────────────
async function requestSocialData(certId: bigint, ttl = 100n) {
  console.log(`\n🛒 Requesting social data for certificate #${certId}...`);
  const { publicClient, walletClient, account } = await getClients();

  const cert = await publicClient.readContract({
    address:      EXCHANGE_ADDRESS as `0x${string}`,
    abi:          EXCHANGE_ABI,
    functionName: "certificates",
    args:         [certId],
  }) as [string, string, string, bigint, boolean];

  const price = cert[3] as bigint;
  console.log(`  Paying : ${formatEther(price)} RITUAL to seller ${cert[0]}`);

  const hash = await walletClient.writeContract({
    address:      EXCHANGE_ADDRESS as `0x${string}`,
    abi:          EXCHANGE_ABI,
    functionName: "requestSocialData",
    args:         [certId, ttl],
    value:        price,
    gas:          3_000_000n,
    maxFeePerGas:          30_000_000_000n,
    maxPriorityFeePerGas:   2_000_000_000n,
  });

  console.log(`  TX sent: ${hash}`);
  console.log(`  ⏳ Waiting for TEE executor to fulfill...`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);

  // Decode spcCalls output from receipt
  const spcCalls = (receipt as any).spcCalls;
  if (spcCalls && spcCalls.length > 0) {
    try {
      const { decodeAbiParameters } = await import("viem");
      const [statusCode, _hkeys, _hvals, body, errorMsg] = decodeAbiParameters(
        [
          { type: "uint16"   },
          { type: "string[]" },
          { type: "string[]" },
          { type: "bytes"    },
          { type: "string"   },
        ],
        spcCalls[0].output
      );

      if (errorMsg) {
        console.log(`  ❌ Executor error: ${errorMsg}`);
      } else {
        const bodyText = Buffer.from((body as string).slice(2), "hex").toString("utf-8");
        console.log(`  📡 HTTP Status : ${statusCode}`);
        console.log(`  📄 Response    :\n${bodyText.slice(0, 500)}`);
        return { statusCode, body: bodyText };
      }
    } catch (e) {
      console.log(`  ⚠️  Could not decode output: ${e}`);
    }
  } else {
    console.log(`  ℹ️  No spcCalls in receipt (simulation mode or not settled yet).`);
  }
}

// ─────────────────────────────────────────────
// 6. LIST ALL CERTIFICATES
// ─────────────────────────────────────────────
async function listAllCertificates() {
  console.log("\n📜 Listing all certificates on exchange...");
  const { publicClient } = await getClients();

  const nextId = await publicClient.readContract({
    address:      EXCHANGE_ADDRESS as `0x${string}`,
    abi:          EXCHANGE_ABI,
    functionName: "nextCertId",
  }) as bigint;

  if (nextId === 0n) {
    console.log("  No certificates listed yet.");
    return;
  }

  for (let i = 0n; i < nextId; i++) {
    await viewCertificate(i);
  }
}

// ─────────────────────────────────────────────
// MAIN — pick which action to run
// ─────────────────────────────────────────────
async function main() {
  const action = process.env.ACTION || "balance";

  switch (action) {
    case "balance":
      await checkBalance();
      break;

    case "deposit":
      await depositFees(process.env.AMOUNT || "0.05", BigInt(process.env.LOCK || "10000"));
      break;

    case "list":
      await listCertificate(
        process.env.API_KEY   || "your-api-key-here",
        process.env.API_URL   || "https://api.twitter.com/2/tweets/search/recent?query=ritual",
        process.env.PRICE_ETH || "0.001"
      );
      break;

    case "view":
      await listAllCertificates();
      break;

    case "buy":
      await requestSocialData(
        BigInt(process.env.CERT_ID || "0"),
        BigInt(process.env.TTL     || "100")
      );
      break;

    default:
      console.log(`Unknown action: ${action}`);
      console.log("Available: balance | deposit | list | view | buy");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
