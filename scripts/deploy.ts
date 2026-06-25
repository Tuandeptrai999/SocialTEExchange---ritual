import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SocialTEExchange with account:", deployer.address);

  const SocialTEExchange = await ethers.getContractFactory("SocialTEExchange");
  const exchange = await SocialTEExchange.deploy();
  await exchange.waitForDeployment();

  const address = await exchange.getAddress();
  console.log("SocialTEExchange deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
