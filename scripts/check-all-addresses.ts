import { ethers } from "hardhat";

async function main() {
  const provider = ethers.provider;

  const DEPLOYER_EOA    = "0x75E698390F225568510DB5b56B34EA4C94AA3b9d";
  const CONTRACT_ADDR   = "0x99B688d84abe81800e3F3991Ad7Fe62aCdA40a6a";
  const RITUAL_WALLET   = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948";
  const TEE_REGISTRY    = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F";
  const TEE_EXECUTOR    = "0x9dc11412391Dc3EDF59811FC9Ee7bEbFD41c8b4C";

  const WALLET_ABI = [
    "function balanceOf(address account) external view returns (uint256)",
    "function lockUntil(address account) external view returns (uint256)"
  ];

  const REGISTRY_ABI = [
    "function getServicesByCapability(uint8 capability, bool checkValidity) external view returns (tuple(tuple(address paymentAddress, address teeAddress, uint8 teeType, bytes publicKey, string endpoint, bytes32 certPubKeyHash, uint8 capability) node, bool isValid, bytes32 workloadId)[])"
  ];

  console.log("==================================================================");
  console.log("🔍 AUDITING ALL ADDRESSES ON RITUAL NETWORK");
  console.log("==================================================================");

  const currentBlock = await provider.getBlockNumber();
  console.log(`Current Block Number: ${currentBlock}\n`);

  // 1. Deployer Wallet Audit
  console.log(`1. Deployer EOA: ${DEPLOYER_EOA}`);
  try {
    const nativeBal = await provider.getBalance(DEPLOYER_EOA);
    console.log(`   - Native Balance: ${ethers.formatEther(nativeBal)} RITUAL`);

    const walletContract = await ethers.getContractAt(WALLET_ABI, RITUAL_WALLET);
    const registryBal = await walletContract.balanceOf(DEPLOYER_EOA);
    const lockBlock = await walletContract.lockUntil(DEPLOYER_EOA);
    const isLocked = currentBlock < Number(lockBlock);

    console.log(`   - RitualWallet Balance: ${ethers.formatEther(registryBal)} RITUAL`);
    console.log(`   - Lock until block: ${lockBlock.toString()} (Locked: ${isLocked})`);
  } catch (err: any) {
    console.log(`   ❌ Error auditing Deployer: ${err.message}`);
  }
  console.log("------------------------------------------------------------------");

  // 2. Contract Audit
  console.log(`2. SocialTEExchange Contract: ${CONTRACT_ADDR}`);
  try {
    const bytecode = await provider.getCode(CONTRACT_ADDR);
    if (bytecode === "0x") {
      console.log("   ❌ Bytecode NOT found (Not Deployed).");
    } else {
      console.log(`   - Bytecode Size: ${(bytecode.length - 2) / 2} bytes (Active)`);
      const nativeBal = await provider.getBalance(CONTRACT_ADDR);
      console.log(`   - Native Balance: ${ethers.formatEther(nativeBal)} RITUAL`);

      const walletContract = await ethers.getContractAt(WALLET_ABI, RITUAL_WALLET);
      const registryBal = await walletContract.balanceOf(CONTRACT_ADDR);
      const lockBlock = await walletContract.lockUntil(CONTRACT_ADDR);
      const isLocked = currentBlock < Number(lockBlock);

      console.log(`   - RitualWallet Balance: ${ethers.formatEther(registryBal)} RITUAL`);
      console.log(`   - Lock until block: ${lockBlock.toString()} (Locked: ${isLocked})`);

      const exchange = await ethers.getContractAt("SocialTEExchange", CONTRACT_ADDR);
      const nextCertId = await exchange.nextCertId();
      console.log(`   - Next Certificate ID: ${nextCertId.toString()}`);
    }
  } catch (err: any) {
    console.log(`   ❌ Error auditing Contract: ${err.message}`);
  }
  console.log("------------------------------------------------------------------");

  // 3. TEE Executor & Registry Audit
  console.log(`3. TEE Executor Registry: ${TEE_REGISTRY}`);
  try {
    const registry = await ethers.getContractAt(REGISTRY_ABI, TEE_REGISTRY);
    const services = await registry.getServicesByCapability(0, true); // 0 = HTTP_CALL capability
    console.log(`   - Found ${services.length} active HTTP executors in registry.`);

    let targetFound = false;
    for (let i = 0; i < services.length; i++) {
      const s = services[i];
      const node = s.node;
      if (node.teeAddress.toLowerCase() === TEE_EXECUTOR.toLowerCase()) {
        targetFound = true;
        console.log(`\n   ⭐ Target Executor Found: ${node.teeAddress}`);
        console.log(`      - Payment Address: ${node.paymentAddress}`);
        console.log(`      - Endpoint: ${node.endpoint}`);
        console.log(`      - Validity status: ${s.isValid ? "VALID" : "INVALID"}`);
        console.log(`      - Workload ID: ${s.workloadId}`);
        console.log(`      - Public Key Length: ${node.publicKey.length - 2} hex chars`);
      }
    }

    if (!targetFound) {
      console.log(`   ⚠️  Target TEE Executor ${TEE_EXECUTOR} was NOT found active in the registry.`);
    }
  } catch (err: any) {
    console.log(`   ❌ Error auditing TEE Registry: ${err.message}`);
  }
  console.log("==================================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
