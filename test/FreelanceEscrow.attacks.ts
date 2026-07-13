import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, createFundedJob, feeOf, DEFAULT_TIMELOCK, ZERO, JS, MS } from "./helpers";
import type { MaliciousReceiver, RevertingReceiver } from "../typechain-types";

describe("FreelanceEscrow — attack tests & guard-matrix completeness (Phase 4)", function () {
  const A = ethers.parseEther("1");
  const B = ethers.parseEther("2");

  // -----------------------------------------------------------------------
  // Reentrancy immunity
  // -----------------------------------------------------------------------
  describe("reentrancy immunity", function () {
    async function maliciousFixture() {
      const base = await loadFixture(deployFixture);
      const { escrow, client } = base;
      const Malicious = await ethers.getContractFactory("MaliciousReceiver");
      const attacker = (await Malicious.deploy(await escrow.getAddress())) as unknown as MaliciousReceiver;
      await attacker.waitForDeployment();

      const attackerAddr = await attacker.getAddress();
      const jobId = (await escrow.jobCounter()) + 1n;
      await escrow.connect(client).createJob(attackerAddr, ZERO, [A], DEFAULT_TIMELOCK, { value: A });
      await attacker.doAccept(jobId);
      await attacker.doSubmit(jobId, 0n, "cid");
      await escrow.connect(client).approveMilestone(jobId, 0n);

      return { ...base, attacker, attackerAddr, jobId };
    }

    it("a malicious freelancer re-entering withdraw() gains nothing beyond its credited balance", async function () {
      const { escrow, attacker, attackerAddr } = await maliciousFixture();
      const { net } = feeOf(A);

      expect(await escrow.pendingWithdrawals(ZERO, attackerAddr)).to.equal(net);
      const contractBalanceBefore = await ethers.provider.getBalance(await escrow.getAddress());

      // The reentrant call into withdraw() is blocked by nonReentrant + the
      // CEI zero-before-transfer pattern, which makes the outer low-level `.call`
      // report failure, so the ENTIRE doWithdraw() transaction reverts.
      await expect(attacker.doWithdraw()).to.be.revertedWithCustomError(escrow, "EthTransferFailed");

      // Nothing moved: the credited balance and the contract's ETH are unchanged
      // (the revert rolled back all state, including the zeroing of pendingWithdrawals).
      expect(await escrow.pendingWithdrawals(ZERO, attackerAddr)).to.equal(net);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(contractBalanceBefore);
    });
  });

  // -----------------------------------------------------------------------
  // Pull-payment DoS resistance — THE THESIS
  // -----------------------------------------------------------------------
  describe("pull-payment DoS resistance (the thesis)", function () {
    async function revertingFixture() {
      const base = await loadFixture(deployFixture);
      const { escrow, client } = base;
      const Reverting = await ethers.getContractFactory("RevertingReceiver");
      const attacker = (await Reverting.deploy(await escrow.getAddress())) as unknown as RevertingReceiver;
      await attacker.waitForDeployment();

      const attackerAddr = await attacker.getAddress();
      const jobId = (await escrow.jobCounter()) + 1n;
      await escrow.connect(client).createJob(attackerAddr, ZERO, [A], DEFAULT_TIMELOCK, { value: A });
      await attacker.doAccept(jobId);
      await attacker.doSubmit(jobId, 0n, "cid");

      return { ...base, attacker, attackerAddr, jobId };
    }

    // THESIS: fund custody is pull-payment-only. `approveMilestone` never makes an
    // external call to the freelancer — it only credits `pendingWithdrawals` — so a
    // freelancer contract that reverts on receiving ETH can NEVER brick the client's
    // ability to approve a milestone. The failure that a hostile recipient causes is
    // strictly confined to that recipient's own later `withdraw()` call.
    it("client's approveMilestone still succeeds even though the freelancer reverts on receive()", async function () {
      const { escrow, client, attackerAddr, jobId } = await revertingFixture();
      const { fee, net } = feeOf(A);

      await expect(escrow.connect(client).approveMilestone(jobId, 0n))
        .to.emit(escrow, "MilestoneApproved")
        .withArgs(jobId, 0n, A, fee);

      expect(await escrow.pendingWithdrawals(ZERO, attackerAddr)).to.equal(net);
      expect((await escrow.getJob(jobId)).state).to.equal(JS.COMPLETED);
    });

    it("the reverting freelancer's own withdraw fails, isolated to the bad actor", async function () {
      const { escrow, client, attacker, jobId } = await revertingFixture();
      await escrow.connect(client).approveMilestone(jobId, 0n);

      await expect(attacker.doWithdraw()).to.be.revertedWithCustomError(escrow, "EthTransferFailed");
    });
  });

  // -----------------------------------------------------------------------
  // Guard-matrix completeness — ADD ONLY WHAT IS MISSING elsewhere in the suite
  // -----------------------------------------------------------------------
  describe("guard-matrix completeness", function () {
    describe("rejectMilestone (no dedicated test file existed)", function () {
      async function submittedFixture() {
        const base = await loadFixture(deployFixture);
        const { escrow, client, freelancer } = base;
        await createFundedJob(escrow, client, freelancer, [A, B]);
        await escrow.connect(freelancer).acceptJob(1n);
        await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid-0");
        return base;
      }

      it("client rejects a submitted milestone: back to PENDING, cleared, removed from scan set", async function () {
        const { escrow, client } = await submittedFixture();
        expect(await escrow.activeSubmittedLength()).to.equal(1n);

        await expect(escrow.connect(client).rejectMilestone(1n, 0n, "needs rework"))
          .to.emit(escrow, "MilestoneRejected")
          .withArgs(1n, 0n, "needs rework");

        const m = await escrow.getMilestone(1n, 0n);
        expect(m.state).to.equal(MS.PENDING);
        expect(m.submittedAt).to.equal(0n);
        expect(m.deliverableCid).to.equal("");
        expect(await escrow.activeSubmittedLength()).to.equal(0n);
      });

      it("freelancer can resubmit after a rejection", async function () {
        const { escrow, client, freelancer } = await submittedFixture();
        await escrow.connect(client).rejectMilestone(1n, 0n, "again please");
        await expect(escrow.connect(freelancer).submitMilestone(1n, 0n, "cid-1")).to.emit(
          escrow,
          "MilestoneSubmitted",
        );
      });

      it("reverts for a non-existent job", async function () {
        const { escrow, client } = await loadFixture(deployFixture);
        await expect(escrow.connect(client).rejectMilestone(99n, 0n, "x")).to.be.revertedWithCustomError(
          escrow,
          "JobNotFound",
        );
      });

      it("reverts when caller is not the client", async function () {
        const { escrow, freelancer } = await submittedFixture();
        await expect(escrow.connect(freelancer).rejectMilestone(1n, 0n, "x")).to.be.revertedWithCustomError(
          escrow,
          "NotClient",
        );
      });

      it("reverts when the job is not IN_PROGRESS", async function () {
        const { escrow, client, freelancer } = await loadFixture(deployFixture);
        await createFundedJob(escrow, client, freelancer, [A]);
        // still FUNDED (not accepted)
        await expect(escrow.connect(client).rejectMilestone(1n, 0n, "x"))
          .to.be.revertedWithCustomError(escrow, "InvalidJobState")
          .withArgs(JS.FUNDED);
      });

      it("reverts on a non-existent milestone index", async function () {
        const { escrow, client } = await submittedFixture();
        await expect(escrow.connect(client).rejectMilestone(1n, 5n, "x")).to.be.revertedWithCustomError(
          escrow,
          "MilestoneNotFound",
        );
      });

      it("reverts rejecting a milestone that is not SUBMITTED", async function () {
        const { escrow, client, freelancer } = await submittedFixture();
        // milestone 1 still PENDING (never submitted)
        await expect(escrow.connect(client).rejectMilestone(1n, 1n, "x"))
          .to.be.revertedWithCustomError(escrow, "InvalidMilestoneState")
          .withArgs(MS.PENDING);
      });
    });

    describe("setArbitrator (no dedicated test file existed)", function () {
      it("owner updates the global arbitrator and emits ArbitratorUpdated", async function () {
        const { escrow, owner, arbitrator, other } = await loadFixture(deployFixture);
        await expect(escrow.connect(owner).setArbitrator(other.address))
          .to.emit(escrow, "ArbitratorUpdated")
          .withArgs(arbitrator.address, other.address);
        expect(await escrow.arbitrator()).to.equal(other.address);
      });

      it("reverts on a zero address", async function () {
        const { escrow, owner } = await loadFixture(deployFixture);
        await expect(escrow.connect(owner).setArbitrator(ZERO)).to.be.revertedWithCustomError(escrow, "ZeroAddress");
      });

      it("reverts for a non-owner", async function () {
        const { escrow, other } = await loadFixture(deployFixture);
        await expect(escrow.connect(other).setArbitrator(other.address)).to.be.revertedWithCustomError(
          escrow,
          "OwnableUnauthorizedAccount",
        );
      });
    });

    describe("double-approve", function () {
      it("approving an already-APPROVED milestone reverts InvalidMilestoneState", async function () {
        const { escrow, client, freelancer } = await loadFixture(deployFixture);
        // Two milestones so the job stays IN_PROGRESS after the first approval —
        // otherwise the job-state guard (COMPLETED) would mask the milestone-state one.
        await createFundedJob(escrow, client, freelancer, [A, B]);
        await escrow.connect(freelancer).acceptJob(1n);
        await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid");
        await escrow.connect(client).approveMilestone(1n, 0n);

        await expect(escrow.connect(client).approveMilestone(1n, 0n))
          .to.be.revertedWithCustomError(escrow, "InvalidMilestoneState")
          .withArgs(MS.APPROVED);
      });
    });

    describe("approve-after-dispute", function () {
      it("approving a milestone whose job has moved to DISPUTED reverts InvalidJobState", async function () {
        const { escrow, client, freelancer } = await loadFixture(deployFixture);
        await createFundedJob(escrow, client, freelancer, [A, B]);
        await escrow.connect(freelancer).acceptJob(1n);
        await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid-0");
        await escrow.connect(freelancer).submitMilestone(1n, 1n, "cid-1");
        await escrow.connect(client).raiseDispute(1n, 0n, "ev");

        // job is now DISPUTED; approving the OTHER (still-SUBMITTED) milestone is
        // blocked at the job-state guard before the milestone-state guard is reached.
        await expect(escrow.connect(client).approveMilestone(1n, 1n))
          .to.be.revertedWithCustomError(escrow, "InvalidJobState")
          .withArgs(JS.DISPUTED);
      });
    });

    describe("createJob over/under-funded (ValueMismatch both directions)", function () {
      it("reverts when msg.value is UNDER the milestone sum", async function () {
        const { escrow, client, freelancer } = await loadFixture(deployFixture);
        await expect(
          escrow.connect(client).createJob(freelancer.address, ZERO, [A, B], DEFAULT_TIMELOCK, { value: A }),
        )
          .to.be.revertedWithCustomError(escrow, "ValueMismatch")
          .withArgs(A + B, A);
      });

      it("reverts when msg.value is OVER the milestone sum", async function () {
        const { escrow, client, freelancer } = await loadFixture(deployFixture);
        const overpaid = A + B + 1n;
        await expect(
          escrow.connect(client).createJob(freelancer.address, ZERO, [A, B], DEFAULT_TIMELOCK, { value: overpaid }),
        )
          .to.be.revertedWithCustomError(escrow, "ValueMismatch")
          .withArgs(A + B, overpaid);
      });
    });

    describe("constructor guards", function () {
      const FEED = "0x0000000000000000000000000000000000000001"; // nonzero placeholder

      it("reverts deploying with feeBps above MAX_FEE_BPS", async function () {
        const [, arbitrator] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("FreelanceEscrow");
        await expect(Factory.deploy(501, arbitrator.address, FEED)).to.be.revertedWithCustomError(
          Factory,
          "InvalidBps",
        );
      });

      it("reverts deploying with a zero-address arbitrator", async function () {
        const Factory = await ethers.getContractFactory("FreelanceEscrow");
        await expect(Factory.deploy(100, ZERO, FEED)).to.be.revertedWithCustomError(Factory, "ZeroAddress");
      });

      it("reverts deploying with a zero-address price feed", async function () {
        const [, arbitrator] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("FreelanceEscrow");
        await expect(Factory.deploy(100, arbitrator.address, ZERO)).to.be.revertedWithCustomError(
          Factory,
          "ZeroAddress",
        );
      });
    });

    describe("unpause", function () {
      it("reverts for a non-owner", async function () {
        const { escrow, owner, other } = await loadFixture(deployFixture);
        await escrow.connect(owner).pause();
        await expect(escrow.connect(other).unpause()).to.be.revertedWithCustomError(
          escrow,
          "OwnableUnauthorizedAccount",
        );
      });
    });

    describe("withdrawFees to a reverting recipient", function () {
      it("reverts EthTransferFailed, isolated from accrued-fee accounting elsewhere", async function () {
        const { escrow, owner, client, freelancer } = await loadFixture(deployFixture);
        await createFundedJob(escrow, client, freelancer, [A]);
        await escrow.connect(freelancer).acceptJob(1n);
        await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid");
        await escrow.connect(client).approveMilestone(1n, 0n);

        const Reverting = await ethers.getContractFactory("RevertingReceiver");
        const badRecipient = (await Reverting.deploy(await escrow.getAddress())) as unknown as RevertingReceiver;
        await badRecipient.waitForDeployment();

        await expect(
          escrow.connect(owner).withdrawFees(ZERO, await badRecipient.getAddress()),
        ).to.be.revertedWithCustomError(escrow, "EthTransferFailed");
      });
    });

    describe("whenNotPaused matrix (every state-changing function not yet exercised while paused)", function () {
      async function pausedSubmittedFixture() {
        const base = await loadFixture(deployFixture);
        const { escrow, owner, client, freelancer } = base;
        await createFundedJob(escrow, client, freelancer, [A, B]);
        await escrow.connect(freelancer).acceptJob(1n);
        await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid-0");
        await escrow.connect(owner).pause();
        return base;
      }

      it("acceptJob reverts when paused", async function () {
        const { escrow, owner, client, freelancer } = await loadFixture(deployFixture);
        await createFundedJob(escrow, client, freelancer, [A]);
        await escrow.connect(owner).pause();
        await expect(escrow.connect(freelancer).acceptJob(1n)).to.be.revertedWithCustomError(escrow, "EnforcedPause");
      });

      it("cancelJob reverts when paused", async function () {
        const { escrow, owner, client, freelancer } = await loadFixture(deployFixture);
        await createFundedJob(escrow, client, freelancer, [A]);
        await escrow.connect(owner).pause();
        await expect(escrow.connect(client).cancelJob(1n)).to.be.revertedWithCustomError(escrow, "EnforcedPause");
      });

      it("submitMilestone reverts when paused", async function () {
        const { escrow, owner, client, freelancer } = await loadFixture(deployFixture);
        await createFundedJob(escrow, client, freelancer, [A]);
        await escrow.connect(freelancer).acceptJob(1n);
        await escrow.connect(owner).pause();
        await expect(escrow.connect(freelancer).submitMilestone(1n, 0n, "x")).to.be.revertedWithCustomError(
          escrow,
          "EnforcedPause",
        );
      });

      it("approveMilestone reverts when paused", async function () {
        const { escrow, client } = await pausedSubmittedFixture();
        await expect(escrow.connect(client).approveMilestone(1n, 0n)).to.be.revertedWithCustomError(
          escrow,
          "EnforcedPause",
        );
      });

      it("rejectMilestone reverts when paused", async function () {
        const { escrow, client } = await pausedSubmittedFixture();
        await expect(escrow.connect(client).rejectMilestone(1n, 0n, "x")).to.be.revertedWithCustomError(
          escrow,
          "EnforcedPause",
        );
      });

      it("raiseDispute reverts when paused", async function () {
        const { escrow, client } = await pausedSubmittedFixture();
        await expect(escrow.connect(client).raiseDispute(1n, 0n, "ev")).to.be.revertedWithCustomError(
          escrow,
          "EnforcedPause",
        );
      });

      it("resolveDispute reverts when paused", async function () {
        const { escrow, owner, client, arbitrator } = await pausedSubmittedFixture();
        // dispute must be raised BEFORE pausing, since raiseDispute itself is whenNotPaused
        await escrow.connect(owner).unpause();
        await escrow.connect(client).raiseDispute(1n, 0n, "ev");
        await escrow.connect(owner).pause();
        await expect(escrow.connect(arbitrator).resolveDispute(1n, 0n, 5000)).to.be.revertedWithCustomError(
          escrow,
          "EnforcedPause",
        );
      });

      it("claimTimelockRelease reverts when paused", async function () {
        const { escrow, other } = await pausedSubmittedFixture();
        await expect(escrow.connect(other).claimTimelockRelease(1n, 0n)).to.be.revertedWithCustomError(
          escrow,
          "EnforcedPause",
        );
      });

      it("raiseDispute reverts InvalidJobState for a job that was never accepted (still FUNDED)", async function () {
        const { escrow, client, freelancer } = await loadFixture(deployFixture);
        await createFundedJob(escrow, client, freelancer, [A]);
        await expect(escrow.connect(client).raiseDispute(1n, 0n, "ev"))
          .to.be.revertedWithCustomError(escrow, "InvalidJobState")
          .withArgs(JS.FUNDED);
      });
    });

    describe("JobNotFound / MilestoneNotFound matrix (every lookup function not yet exercised)", function () {
      it("submitMilestone reverts JobNotFound for a non-existent job", async function () {
        const { escrow, freelancer } = await loadFixture(deployFixture);
        await expect(escrow.connect(freelancer).submitMilestone(99n, 0n, "x")).to.be.revertedWithCustomError(
          escrow,
          "JobNotFound",
        );
      });

      it("approveMilestone reverts JobNotFound for a non-existent job", async function () {
        const { escrow, client } = await loadFixture(deployFixture);
        await expect(escrow.connect(client).approveMilestone(99n, 0n)).to.be.revertedWithCustomError(
          escrow,
          "JobNotFound",
        );
      });

      it("approveMilestone reverts MilestoneNotFound for an out-of-range index", async function () {
        const { escrow, client, freelancer } = await loadFixture(deployFixture);
        await createFundedJob(escrow, client, freelancer, [A]);
        await escrow.connect(freelancer).acceptJob(1n);
        await expect(escrow.connect(client).approveMilestone(1n, 5n)).to.be.revertedWithCustomError(
          escrow,
          "MilestoneNotFound",
        );
      });

      it("raiseDispute reverts JobNotFound for a non-existent job", async function () {
        const { escrow, client } = await loadFixture(deployFixture);
        await expect(escrow.connect(client).raiseDispute(99n, 0n, "ev")).to.be.revertedWithCustomError(
          escrow,
          "JobNotFound",
        );
      });

      it("raiseDispute reverts MilestoneNotFound for an out-of-range index", async function () {
        const { escrow, client, freelancer } = await loadFixture(deployFixture);
        await createFundedJob(escrow, client, freelancer, [A]);
        await escrow.connect(freelancer).acceptJob(1n);
        await expect(escrow.connect(client).raiseDispute(1n, 5n, "ev")).to.be.revertedWithCustomError(
          escrow,
          "MilestoneNotFound",
        );
      });

      it("resolveDispute reverts JobNotFound for a non-existent job", async function () {
        const { escrow, arbitrator } = await loadFixture(deployFixture);
        await expect(escrow.connect(arbitrator).resolveDispute(99n, 0n, 5000)).to.be.revertedWithCustomError(
          escrow,
          "JobNotFound",
        );
      });

      it("resolveDispute reverts MilestoneNotFound for an out-of-range index", async function () {
        const { escrow, client, freelancer, arbitrator } = await loadFixture(deployFixture);
        await createFundedJob(escrow, client, freelancer, [A]);
        await escrow.connect(freelancer).acceptJob(1n);
        await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid");
        await escrow.connect(client).raiseDispute(1n, 0n, "ev");
        await expect(escrow.connect(arbitrator).resolveDispute(1n, 5n, 5000)).to.be.revertedWithCustomError(
          escrow,
          "MilestoneNotFound",
        );
      });

      it("resolveDispute reverts InvalidMilestoneState for a milestone that is not itself DISPUTED", async function () {
        // Job is DISPUTED (milestone 0 disputed) but milestone 1 is still merely SUBMITTED.
        const { escrow, client, freelancer, arbitrator } = await loadFixture(deployFixture);
        await createFundedJob(escrow, client, freelancer, [A, B]);
        await escrow.connect(freelancer).acceptJob(1n);
        await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid-0");
        await escrow.connect(freelancer).submitMilestone(1n, 1n, "cid-1");
        await escrow.connect(client).raiseDispute(1n, 0n, "ev");

        await expect(escrow.connect(arbitrator).resolveDispute(1n, 1n, 5000))
          .to.be.revertedWithCustomError(escrow, "InvalidMilestoneState")
          .withArgs(MS.SUBMITTED);
      });

      it("claimTimelockRelease reverts JobNotFound for a non-existent job", async function () {
        const { escrow, other } = await loadFixture(deployFixture);
        await expect(escrow.connect(other).claimTimelockRelease(99n, 0n)).to.be.revertedWithCustomError(
          escrow,
          "JobNotFound",
        );
      });

      it("claimTimelockRelease reverts MilestoneNotFound for an out-of-range index", async function () {
        const { escrow, client, freelancer, other } = await loadFixture(deployFixture);
        await createFundedJob(escrow, client, freelancer, [A]);
        await escrow.connect(freelancer).acceptJob(1n);
        await expect(escrow.connect(other).claimTimelockRelease(1n, 5n)).to.be.revertedWithCustomError(
          escrow,
          "MilestoneNotFound",
        );
      });
    });
  });
});
