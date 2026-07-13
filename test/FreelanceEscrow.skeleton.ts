import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("FreelanceEscrow — Phase 1 skeleton", function () {
  const FEE_BPS = 100; // 1%

  async function deployFixture() {
    const [, arbitrator] = await ethers.getSigners();
    const Feed = await ethers.getContractFactory("MockV3Aggregator");
    const feed = await Feed.deploy(8, 2000n * 10n ** 8n);
    await feed.waitForDeployment();
    const FreelanceEscrow = await ethers.getContractFactory("FreelanceEscrow");
    const escrow = await FreelanceEscrow.deploy(FEE_BPS, arbitrator.address, await feed.getAddress());
    await escrow.waitForDeployment();
    return { escrow, arbitrator };
  }

  it("deploys and stores the constructor arguments", async function () {
    const { escrow, arbitrator } = await loadFixture(deployFixture);

    expect(await escrow.feeBps()).to.equal(FEE_BPS);
    expect(await escrow.arbitrator()).to.equal(arbitrator.address);
  });
});
