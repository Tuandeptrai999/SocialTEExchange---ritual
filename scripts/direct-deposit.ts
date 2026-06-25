import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Checking deployer:", deployer.address);

  const RITUAL_WALLET = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948";
  const WALLET_ABI = [
    "function deposit(uint256 lockDuration) external payable",
    "function depositFor(address user, uint256 lockDuration) external payable",
    "function balanceOf(address account) external view returns (uint256)",
    "function lockUntil(address account) external view returns (uint256)"
  ];

  const walletContract = await ethers.getContractAt(WALLET_ABI, RITUAL_WALLET);

  console.log("\nEstimating gas for deposit(10000) with 0.05 RITUAL...");
  try {
    const gasEstimate = await walletContract.deposit.estimateGas(10000, {
      value: ethers.parseEther("0.05")
    });
    console.log(`✅ Gas Estimate: ${gasEstimate.toString()}`);

    // If gas estimation succeeds, let's send the transaction!
    console.log("Sending deposit transaction...");
    const tx = await walletContract.deposit(10000, {
      value: ethers.parseEther("0.05")
    });
    console.log(`Transaction sent: ${tx.hash}`);
    console.log("Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log(`✅ Confirmed in block ${receipt?.blockNumber}`);
  } catch (err: any) {
    console.error("❌ Error performing deposit:", err.message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
