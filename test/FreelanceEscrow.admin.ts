import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, createFundedJob, feeOf, ZERO } from "./helpers";

describe("FreelanceEscrow — admin (Phase 2)", function () {
  const A = ethers.parseEther("1");

  describe("setFeeBps", function () {
    it("owner can update the fee and it emits FeeUpdated", async function () {
      const { escrow, owner } = await loadFixture(deployFixture);
      await expect(escrow.connect(owner).setFeeBps(250)).to.emit(escrow, "FeeUpdated").withArgs(100n, 250n);
      expect(await escrow.feeBps()).to.equal(250n);
    });

    it("reverts above MAX_FEE_BPS", async function () {
      const { escrow, owner } = await loadFixture(deployFixture);
      await expect(escrow.connect(owner).setFeeBps(501)).to.be.revertedWithCustomError(escrow, "InvalidBps");
    });

    it("reverts for non-owner", async function () {
      const { escrow, other } = await loadFixture(deployFixture);
      await expect(escrow.connect(other).setFeeBps(10)).to.be.revertedWithCustomError(
        escrow,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("withdrawFees", function () {
    async function withAccruedFees() {
      const base = await loadFixture(deployFixture);
      const { escrow, client, freelancer } = base;
      await createFundedJob(escrow, client, freelancer, [A]);
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid");
      await escrow.connect(client).approveMilestone(1n, 0n);
      return base;
    }

    it("owner withdraws accrued ETH fees to a recipient and emits FeesWithdrawn", async function () {
      const { escrow, owner, other } = await withAccruedFees();
      const { fee } = feeOf(A);
      expect(await escrow.accruedFees(ZERO)).to.equal(fee);

      await expect(escrow.connect(owner).withdrawFees(ZERO, other.address)).to.changeEtherBalance(other, fee);
      expect(await escrow.accruedFees(ZERO)).to.equal(0n);
    });

    it("reverts to a zero recipient", async function () {
      const { escrow, owner } = await withAccruedFees();
      await expect(escrow.connect(owner).withdrawFees(ZERO, ZERO)).to.be.revertedWithCustomError(escrow, "ZeroAddress");
    });

    it("reverts when there are no accrued fees", async function () {
      const { escrow, owner, other } = await loadFixture(deployFixture);
      await expect(escrow.connect(owner).withdrawFees(ZERO, other.address)).to.be.revertedWithCustomError(
        escrow,
        "NothingToWithdraw",
      );
    });

    it("reverts for non-owner", async function () {
      const { escrow, other } = await withAccruedFees();
      await expect(escrow.connect(other).withdrawFees(ZERO, other.address)).to.be.revertedWithCustomError(
        escrow,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("pause / unpause", function () {
    it("owner can pause and unpause", async function () {
      const { escrow, owner, client, freelancer } = await loadFixture(deployFixture);
      await escrow.connect(owner).pause();
      expect(await escrow.paused()).to.equal(true);
      await escrow.connect(owner).unpause();
      expect(await escrow.paused()).to.equal(false);
      // sanity: creating works again after unpause
      await createFundedJob(escrow, client, freelancer, [A]);
      expect(await escrow.jobCounter()).to.equal(1n);
    });

    it("reverts pause for non-owner", async function () {
      const { escrow, other } = await loadFixture(deployFixture);
      await expect(escrow.connect(other).pause()).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });
  });
});
