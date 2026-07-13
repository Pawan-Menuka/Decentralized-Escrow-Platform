import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, createFundedJob, feeOf, ZERO, JS, MS } from "./helpers";

describe("FreelanceEscrow — disputes (Phase 3)", function () {
  const A = ethers.parseEther("1");
  const B = ethers.parseEther("2");

  /** Job with two milestones, accepted, both submitted. */
  async function submittedFixture() {
    const base = await loadFixture(deployFixture);
    const { escrow, client, freelancer } = base;
    await createFundedJob(escrow, client, freelancer, [A, B]);
    await escrow.connect(freelancer).acceptJob(1n);
    await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid-0");
    await escrow.connect(freelancer).submitMilestone(1n, 1n, "cid-1");
    return base;
  }

  describe("raiseDispute", function () {
    it("client can dispute; milestone+job -> DISPUTED, removed from scan set", async function () {
      const { escrow, client } = await submittedFixture();
      expect(await escrow.activeSubmittedLength()).to.equal(2n);

      await expect(escrow.connect(client).raiseDispute(1n, 0n, "ev-0"))
        .to.emit(escrow, "DisputeRaised")
        .withArgs(1n, 0n, client.address, "ev-0");

      expect((await escrow.getMilestone(1n, 0n)).state).to.equal(MS.DISPUTED);
      expect((await escrow.getJob(1n)).state).to.equal(JS.DISPUTED);
      expect(await escrow.disputedCount(1n)).to.equal(1n);
      expect(await escrow.activeSubmittedLength()).to.equal(1n); // milestone 0 pulled out
    });

    it("freelancer can also dispute", async function () {
      const { escrow, freelancer } = await submittedFixture();
      await expect(escrow.connect(freelancer).raiseDispute(1n, 1n, "ev"))
        .to.emit(escrow, "DisputeRaised")
        .withArgs(1n, 1n, freelancer.address, "ev");
    });

    it("reverts for a non-participant", async function () {
      const { escrow, other } = await submittedFixture();
      await expect(escrow.connect(other).raiseDispute(1n, 0n, "ev")).to.be.revertedWithCustomError(
        escrow,
        "NotParticipant",
      );
    });

    it("reverts disputing a non-SUBMITTED milestone", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await createFundedJob(escrow, client, freelancer, [A]);
      await escrow.connect(freelancer).acceptJob(1n);
      // milestone still PENDING
      await expect(escrow.connect(client).raiseDispute(1n, 0n, "ev"))
        .to.be.revertedWithCustomError(escrow, "InvalidMilestoneState")
        .withArgs(MS.PENDING);
    });

    it("supports concurrent disputes on the same job", async function () {
      const { escrow, client, freelancer } = await submittedFixture();
      await escrow.connect(client).raiseDispute(1n, 0n, "e0");
      await escrow.connect(freelancer).raiseDispute(1n, 1n, "e1");
      expect(await escrow.disputedCount(1n)).to.equal(2n);
      expect(await escrow.activeSubmittedLength()).to.equal(0n);
    });
  });

  describe("resolveDispute", function () {
    it("splits 60/40 with fee taken from the freelancer share; job completes (single ms)", async function () {
      const base = await loadFixture(deployFixture);
      const { escrow, client, freelancer, arbitrator } = base;
      await createFundedJob(escrow, client, freelancer, [A]);
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid");
      await escrow.connect(client).raiseDispute(1n, 0n, "ev");

      const freelancerGross = (A * 6000n) / 10000n; // 0.6 ETH
      const clientAmount = A - freelancerGross; // 0.4 ETH
      const { fee, net: freelancerAmount } = feeOf(freelancerGross);

      await expect(escrow.connect(arbitrator).resolveDispute(1n, 0n, 6000))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(1n, 0n, 6000n, freelancerAmount, clientAmount, fee);

      expect(await escrow.pendingWithdrawals(ZERO, freelancer.address)).to.equal(freelancerAmount);
      expect(await escrow.pendingWithdrawals(ZERO, client.address)).to.equal(clientAmount);
      expect(await escrow.accruedFees(ZERO)).to.equal(fee);

      // conservation: nothing created or destroyed
      expect(freelancerAmount + clientAmount + fee).to.equal(A);

      const job = await escrow.getJob(1n);
      expect(job.state).to.equal(JS.COMPLETED); // only milestone, now terminal
      expect(await escrow.disputedCount(1n)).to.equal(0n);
    });

    it("100% to freelancer credits nothing to client", async function () {
      const base = await loadFixture(deployFixture);
      const { escrow, client, freelancer, arbitrator } = base;
      await createFundedJob(escrow, client, freelancer, [A]);
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid");
      await escrow.connect(freelancer).raiseDispute(1n, 0n, "ev");

      const { fee, net } = feeOf(A);
      await escrow.connect(arbitrator).resolveDispute(1n, 0n, 10000);
      expect(await escrow.pendingWithdrawals(ZERO, freelancer.address)).to.equal(net);
      expect(await escrow.pendingWithdrawals(ZERO, client.address)).to.equal(0n);
      expect(await escrow.accruedFees(ZERO)).to.equal(fee);
    });

    it("0% to freelancer refunds the whole milestone to the client (no fee)", async function () {
      const base = await loadFixture(deployFixture);
      const { escrow, client, freelancer, arbitrator } = base;
      await createFundedJob(escrow, client, freelancer, [A]);
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid");
      await escrow.connect(client).raiseDispute(1n, 0n, "ev");

      await escrow.connect(arbitrator).resolveDispute(1n, 0n, 0);
      expect(await escrow.pendingWithdrawals(ZERO, client.address)).to.equal(A);
      expect(await escrow.pendingWithdrawals(ZERO, freelancer.address)).to.equal(0n);
      expect(await escrow.accruedFees(ZERO)).to.equal(0n);
    });

    it("returns a multi-milestone job to IN_PROGRESS while other work remains", async function () {
      const { escrow, client, freelancer, arbitrator } = await submittedFixture();
      await escrow.connect(client).raiseDispute(1n, 0n, "ev");
      await escrow.connect(arbitrator).resolveDispute(1n, 0n, 5000);

      const job = await escrow.getJob(1n);
      expect(job.state).to.equal(JS.IN_PROGRESS); // milestone 1 still SUBMITTED
      expect(job.approvedCount).to.equal(1n);
      // milestone 1 can still be approved normally afterwards
      await escrow.connect(client).approveMilestone(1n, 1n);
      expect((await escrow.getJob(1n)).state).to.equal(JS.COMPLETED);
    });

    it("keeps job DISPUTED until the LAST open dispute is resolved", async function () {
      const { escrow, client, freelancer, arbitrator } = await submittedFixture();
      await escrow.connect(client).raiseDispute(1n, 0n, "e0");
      await escrow.connect(client).raiseDispute(1n, 1n, "e1");

      await escrow.connect(arbitrator).resolveDispute(1n, 0n, 5000);
      expect((await escrow.getJob(1n)).state).to.equal(JS.DISPUTED); // one still open
      expect(await escrow.disputedCount(1n)).to.equal(1n);

      await escrow.connect(arbitrator).resolveDispute(1n, 1n, 5000);
      expect((await escrow.getJob(1n)).state).to.equal(JS.COMPLETED);
      expect(await escrow.disputedCount(1n)).to.equal(0n);
    });

    it("reverts for a non-arbitrator (even the client/owner)", async function () {
      const { escrow, client } = await submittedFixture();
      await escrow.connect(client).raiseDispute(1n, 0n, "ev");
      await expect(escrow.connect(client).resolveDispute(1n, 0n, 5000)).to.be.revertedWithCustomError(
        escrow,
        "NotArbitrator",
      );
    });

    it("reverts on invalid bps (> 10000)", async function () {
      const { escrow, client, arbitrator } = await submittedFixture();
      await escrow.connect(client).raiseDispute(1n, 0n, "ev");
      await expect(escrow.connect(arbitrator).resolveDispute(1n, 0n, 10001)).to.be.revertedWithCustomError(
        escrow,
        "InvalidBps",
      );
    });

    it("reverts resolving when the job is not DISPUTED", async function () {
      const { escrow, arbitrator } = await submittedFixture();
      await expect(escrow.connect(arbitrator).resolveDispute(1n, 0n, 5000))
        .to.be.revertedWithCustomError(escrow, "InvalidJobState")
        .withArgs(JS.IN_PROGRESS);
    });

    it("uses the snapshotted arbitrator, not a later global one", async function () {
      const { escrow, owner, client, freelancer, arbitrator, other } = await submittedFixture();
      await escrow.connect(client).raiseDispute(1n, 0n, "ev");
      // owner changes the GLOBAL arbitrator after the job was created
      await escrow.connect(owner).setArbitrator(other.address);
      // the new global arbitrator cannot resolve this pre-existing job
      await expect(escrow.connect(other).resolveDispute(1n, 0n, 5000)).to.be.revertedWithCustomError(
        escrow,
        "NotArbitrator",
      );
      // the snapshotted arbitrator still can
      await expect(escrow.connect(arbitrator).resolveDispute(1n, 0n, 5000)).to.emit(escrow, "DisputeResolved");
    });
  });
});
