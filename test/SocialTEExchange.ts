import { expect } from "chai";
import { ethers } from "hardhat";

describe("SocialTEExchange", function () {
  it("Should list a certificate successfully", async function () {
    const SocialTEExchange = await ethers.getContractFactory("SocialTEExchange");
    const exchange = await SocialTEExchange.deploy();

    const [seller] = await ethers.getSigners();
    
    const executor = ethers.Wallet.createRandom().address;
    const encryptedSecrets = [ethers.hexlify(ethers.randomBytes(32))];
    const secretSignatures = [ethers.hexlify(ethers.randomBytes(65))];
    const url = "https://api.example.com";
    const price = ethers.parseEther("0.1");

    await expect(exchange.listCertificate(
      executor,
      encryptedSecrets,
      secretSignatures,
      url,
      price
    )).to.emit(exchange, "CertificateListed").withArgs(0, seller.address, price);

    const cert = await exchange.certificates(0);
    expect(cert.seller).to.equal(seller.address);
    expect(cert.executor).to.equal(executor);
    expect(cert.url).to.equal(url);
    expect(cert.price).to.equal(price);
    expect(cert.active).to.equal(true);
  });

  it("Should allow seller to toggle and update price", async function () {
    const SocialTEExchange = await ethers.getContractFactory("SocialTEExchange");
    const exchange = await SocialTEExchange.deploy();
    
    const executor = ethers.Wallet.createRandom().address;
    await exchange.listCertificate(executor, [], [], "url", ethers.parseEther("0.1"));

    await expect(exchange.toggleCertificate(0, false))
      .to.emit(exchange, "CertificateUpdated").withArgs(0, ethers.parseEther("0.1"), false);
      
    await expect(exchange.updatePrice(0, ethers.parseEther("0.2")))
      .to.emit(exchange, "CertificateUpdated").withArgs(0, ethers.parseEther("0.2"), false);
  });
});
