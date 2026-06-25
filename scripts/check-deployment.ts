import { ethers } from "hardhat";

async function main() {
  const address = "0x99B688d84abe81800e3F3991Ad7Fe62aCdA40a6a";
  console.log(`Checking contract at address: ${address}`);

  const provider = ethers.provider;
  const bytecode = await provider.getCode(address);

  if (bytecode === "0x") {
    console.log("❌ No contract bytecode found at this address.");
  } else {
    console.log(`\n✅ Contract is active on Ritual Chain (chainId 1979)`);
    console.log(`- Bytecode size: ${(bytecode.length - 2) / 2} bytes`);

    // 1. Native balance of the contract
    const nativeBalance = await provider.getBalance(address);
    console.log(`- Contract Native Balance: ${ethers.formatEther(nativeBalance)} RITUAL`);

    // 2. Fetch public states from SocialTEExchange
    try {
      const exchange = await ethers.getContractAt("SocialTEExchange", address);
      const nextCertId = await exchange.nextCertId();
      console.log(`- nextCertId (listed certificates): ${nextCertId.toString()}`);
    } catch (err: any) {
      console.log("Could not query SocialTEExchange parameters. Error:", err.message);
    }

    // 3. Balance of the contract inside RitualWallet
    const RITUAL_WALLET = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948";
    const WALLET_ABI = [
      "function balanceOf(address account) external view returns (uint256)",
      "function lockUntil(address account) external view returns (uint256)"
    ];
    try {
      const walletContract = await ethers.getContractAt(WALLET_ABI, RITUAL_WALLET);
      const walletBalance = await walletContract.balanceOf(address);
      const lockUntil = await walletContract.lockUntil(address);
      const currentBlock = await provider.getBlockNumber();
      console.log(`- Contract balance in RitualWallet: ${ethers.formatEther(walletBalance)} RITUAL`);
      console.log(`- Lock until block: ${lockUntil.toString()} (current: ${currentBlock})`);
    } catch (err: any) {
      console.log("Could not query RitualWallet balance. Error:", err.message);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
