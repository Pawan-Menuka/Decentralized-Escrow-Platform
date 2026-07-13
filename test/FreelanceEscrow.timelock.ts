import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, createFundedJob, feeOf, DEFAULT_TIMELOCK, ZERO, JS, MS } from "./helpers";

describe("FreelanceEscrow — timelock auto-release (Phase 3)", function () {
  const A = ethers.parseEther("1");
  const B = ethers.parseEther("2");

  /** Two-milestone job, accepted, milestone 0 submitted. */
  async function submittedFixture() {
    const base = await loadFixture(deployFixture);
    const { escrow, client, freelancer } = base;
    await createFundedJob(escrow, client, freelancer, [A, B]);
    await escrow.connect(freelancer).acceptJob(1n);
    await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid-0");
    return base;
  }

  it("reverts before the deadline", async function () {
    const { escrow, other } = await submittedFixture();
    await time.increase(DEFAULT_TIMELOCK - 60); // just short of the deadline
    await expect(escrow.connect(other).claimTimelockRelease(1n, 0n)).to.be.revertedWithCustomError(
      escrow,
      "TimelockNotExpired",
    );
  });

  it("anyone can release after the deadline; freelancer credited net-of-fee", async function () {
    const { escrow, freelancer, other } = await submittedFixture();
    await time.increase(DEFAULT_TIMELOCK + 1);

    const { fee, net } = feeOf(A);
    await expect(escrow.connect(other).claimTimelockRelease(1n, 0n)) // 'other' = not a participant
      .to.emit(escrow, "MilestoneAutoReleased")
      .withArgs(1n, 0n, A, fee);

    expect(await escrow.pendingWithdrawals(ZERO, freelancer.address)).to.equal(net);
    expect(await escrow.accruedFees(ZERO)).to.equal(fee);
    expect((await escrow.getMilestone(1n, 0n)).state).to.equal(MS.AUTO_RELEASED);
    expect(await escrow.activeSubmittedLength()).to.equal(0n);
    expect((await escrow.getJob(1n)).state).to.equal(JS.IN_PROGRESS); // milestone 1 never submitted
  });

  it("completes the job if auto-release clears the last milestone", async function () {
    const { escrow, client, freelancer } = await loadFixture(deployFixture);
    await createFundedJob(escrow, client, freelancer, [A]);
    await escrow.connect(freelancer).acceptJob(1n);
    await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid");
    await time.increase(DEFAULT_TIMELOCK + 1);
    await escrow.connect(freelancer).claimTimelockRelease(1n, 0n);
    expect((await escrow.getJob(1n)).state).to.equal(JS.COMPLETED);
  });

  it("reverts auto-releasing a non-SUBMITTED milestone", async function () {
    const { escrow, freelancer } = await submittedFixture();
    await time.increase(DEFAULT_TIMELOCK + 1);
    // milestone 1 was never submitted -> PENDING
    await expect(escrow.connect(freelancer).claimTimelockRelease(1n, 1n))
      .to.be.revertedWithCustomError(escrow, "InvalidMilestoneState")
      .withArgs(MS.PENDING);
  });

  it("a disputed milestone can never auto-release (it is no longer SUBMITTED)", async function () {
    const { escrow, client, freelancer } = await submittedFixture();
    await escrow.connect(client).raiseDispute(1n, 0n, "ev");
    await time.increase(DEFAULT_TIMELOCK + 1);
    await expect(escrow.connect(freelancer).claimTimelockRelease(1n, 0n))
      .to.be.revertedWithCustomError(escrow, "InvalidMilestoneState")
      .withArgs(MS.DISPUTED);
  });
});
