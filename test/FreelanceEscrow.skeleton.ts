import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("FreelanceEscrow — Phase 1 skeleton", function () {
  const FEE_BPS = 100; // 1%

  async function deployFixture() {
    const [, arbitrator] = await ethers.getSigners();
    const FreelanceEscrow = await ethers.getContractFactory("FreelanceEscrow");
    const escrow = await FreelanceEscrow.deploy(FEE_BPS, arbitrator.address);
    await escrow.waitForDeployment();
    return { escrow, arbitrator };
  }

  it("deploys and stores the constructor arguments", async function () {
    const { escrow, arbitrator } = await loadFixture(deployFixture);

    expect(await escrow.feeBps()).to.equal(FEE_BPS);
    expect(await escrow.arbitrator()).to.equal(arbitrator.address);
  });
});
