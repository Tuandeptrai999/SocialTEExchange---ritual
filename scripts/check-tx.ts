import { ethers } from "hardhat";

async function main() {
  const txHash = "0x7401f435e8c9f8cc2234aedd34d931fa293d5ab52595c13a97b703ffc175842b";
  console.log(`Checking transaction status for hash: ${txHash}`);

  const provider = ethers.provider;
  const tx = await provider.getTransaction(txHash);
  if (!tx) {
    console.log("❌ Transaction not found on-chain (yet).");
    return;
  }

  console.log(`- Block number: ${tx.blockNumber}`);
  console.log(`- From: ${tx.from}`);
  console.log(`- To: ${tx.to}`);

  const receipt = await provider.getTransactionReceipt(txHash);
  if (receipt) {
    console.log(`✅ Transaction has been confirmed!`);
    console.log(`- Status: ${receipt.status === 1 ? "SUCCESS" : "FAILED"}`);
    console.log(`- Block number: ${receipt.blockNumber}`);
    console.log(`- Gas Used: ${receipt.gasUsed.toString()}`);
  } else {
    console.log(`⏳ Transaction is still pending (not mined yet).`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
