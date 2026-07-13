import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, createFundedJob, feeOf, DEFAULT_TIMELOCK, ZERO, JS, MS } from "./helpers";

describe("FreelanceEscrow — happy-path lifecycle (Phase 2)", function () {
  const A = ethers.parseEther("1");
  const B = ethers.parseEther("2");

  describe("acceptJob", function () {
    it("moves FUNDED -> IN_PROGRESS and emits JobAccepted", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await createFundedJob(escrow, client, freelancer, [A]);
      await expect(escrow.connect(freelancer).acceptJob(1n)).to.emit(escrow, "JobAccepted").withArgs(1n, freelancer.address);
      expect((await escrow.getJob(1n)).state).to.equal(JS.IN_PROGRESS);
    });

    it("reverts for a non-existent job", async function () {
      const { escrow, freelancer } = await loadFixture(deployFixture);
      await expect(escrow.connect(freelancer).acceptJob(99n)).to.be.revertedWithCustomError(escrow, "JobNotFound");
    });

    it("reverts when caller is not the freelancer", async function () {
      const { escrow, client, freelancer, other } = await loadFixture(deployFixture);
      await createFundedJob(escrow, client, freelancer, [A]);
      await expect(escrow.connect(other).acceptJob(1n)).to.be.revertedWithCustomError(escrow, "NotFreelancer");
    });

    it("reverts when already accepted (wrong state)", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await createFundedJob(escrow, client, freelancer, [A]);
      await escrow.connect(freelancer).acceptJob(1n);
      await expect(escrow.connect(freelancer).acceptJob(1n))
        .to.be.revertedWithCustomError(escrow, "InvalidJobState")
        .withArgs(JS.IN_PROGRESS);
    });
  });

  describe("submitMilestone", function () {
    it("moves PENDING -> SUBMITTED, records CID + timestamp, tracks activeSubmitted", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await createFundedJob(escrow, client, freelancer, [A, B]);
      await escrow.connect(freelancer).acceptJob(1n);

      await expect(escrow.connect(freelancer).submitMilestone(1n, 0n, "cid-0"))
        .to.emit(escrow, "MilestoneSubmitted")
        .withArgs(1n, 0n, "cid-0");

      const m = await escrow.getMilestone(1n, 0n);
      expect(m.state).to.equal(MS.SUBMITTED);
      expect(m.deliverableCid).to.equal("cid-0");
      expect(m.submittedAt).to.be.greaterThan(0n);
      expect(await escrow.activeSubmittedLength()).to.equal(1n);
    });

    it("reverts submitting a non-existent milestone index", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await createFundedJob(escrow, client, freelancer, [A]);
      await escrow.connect(freelancer).acceptJob(1n);
      await expect(escrow.connect(freelancer).submitMilestone(1n, 5n, "x")).to.be.revertedWithCustomError(
        escrow,
        "MilestoneNotFound",
      );
    });

    it("reverts submitting before the job is accepted (wrong job state)", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await createFundedJob(escrow, client, freelancer, [A]);
      await expect(escrow.connect(freelancer).submitMilestone(1n, 0n, "x"))
        .to.be.revertedWithCustomError(escrow, "InvalidJobState")
        .withArgs(JS.FUNDED);
    });

    it("reverts when caller is not the freelancer", async function () {
      const { escrow, client, freelancer, other } = await loadFixture(deployFixture);
      await createFundedJob(escrow, client, freelancer, [A]);
      await escrow.connect(freelancer).acceptJob(1n);
      await expect(escrow.connect(other).submitMilestone(1n, 0n, "x")).to.be.revertedWithCustomError(
        escrow,
        "NotFreelancer",
      );
    });

    it("reverts re-submitting an already-submitted milestone", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await createFundedJob(escrow, client, freelancer, [A]);
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "x");
      await expect(escrow.connect(freelancer).submitMilestone(1n, 0n, "x"))
        .to.be.revertedWithCustomError(escrow, "InvalidMilestoneState")
        .withArgs(MS.SUBMITTED);
    });
  });

  describe("approveMilestone", function () {
    it("credits freelancer net-of-fee, accrues fee, removes from activeSubmitted, emits", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await createFundedJob(escrow, client, freelancer, [A, B]);
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid-0");

      const { fee, net } = feeOf(A);
      await expect(escrow.connect(client).approveMilestone(1n, 0n))
        .to.emit(escrow, "MilestoneApproved")
        .withArgs(1n, 0n, A, fee);

      expect(await escrow.pendingWithdrawals(ZERO, freelancer.address)).to.equal(net);
      expect(await escrow.accruedFees(ZERO)).to.equal(fee);
      expect(await escrow.activeSubmittedLength()).to.equal(0n);
      expect((await escrow.getMilestone(1n, 0n)).state).to.equal(MS.APPROVED);

      const job = await escrow.getJob(1n);
      expect(job.approvedCount).to.equal(1n);
      expect(job.state).to.equal(JS.IN_PROGRESS); // not yet complete (2 milestones)
    });

    it("completes the job when the last milestone is approved", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await createFundedJob(escrow, client, freelancer, [A, B]);
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "a");
      await escrow.connect(freelancer).submitMilestone(1n, 1n, "b");
      await escrow.connect(client).approveMilestone(1n, 0n);

      await expect(escrow.connect(client).approveMilestone(1n, 1n)).to.emit(escrow, "JobCompleted").withArgs(1n);
      expect((await escrow.getJob(1n)).state).to.equal(JS.COMPLETED);

      // fee + net accounting across both milestones, to the wei
      const total = A + B;
      const { fee, net } = feeOf(total);
      expect(await escrow.pendingWithdrawals(ZERO, freelancer.address)).to.equal(net);
      expect(await escrow.accruedFees(ZERO)).to.equal(fee);
    });

    it("reverts when caller is not the client", async function () {
      const { escrow, client, freelancer, other } = await loadFixture(deployFixture);
      await createFundedJob(escrow, client, freelancer, [A]);
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "a");
      await expect(escrow.connect(other).approveMilestone(1n, 0n)).to.be.revertedWithCustomError(escrow, "NotClient");
    });

    it("reverts approving a milestone that is not SUBMITTED", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await createFundedJob(escrow, client, freelancer, [A]);
      await escrow.connect(freelancer).acceptJob(1n);
      await expect(escrow.connect(client).approveMilestone(1n, 0n))
        .to.be.revertedWithCustomError(escrow, "InvalidMilestoneState")
        .withArgs(MS.PENDING);
    });

    it("with a zero fee, credits the full amount and accrues nothing", async function () {
      const { escrow, owner, client, freelancer } = await loadFixture(deployFixture);
      await escrow.connect(owner).setFeeBps(0);
      await createFundedJob(escrow, client, freelancer, [A]);
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "a");
      await escrow.connect(client).approveMilestone(1n, 0n);
      expect(await escrow.pendingWithdrawals(ZERO, freelancer.address)).to.equal(A);
      expect(await escrow.accruedFees(ZERO)).to.equal(0n);
    });
  });
});
