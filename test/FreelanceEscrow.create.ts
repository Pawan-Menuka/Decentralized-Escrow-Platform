import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, createFundedJob, DEFAULT_TIMELOCK, ZERO, JS, MS } from "./helpers";

describe("FreelanceEscrow — createJob (Phase 2)", function () {
  const A = ethers.parseEther("1");
  const B = ethers.parseEther("2");

  it("creates a fully-funded job, stores state, and emits JobCreated", async function () {
    const { escrow, client, freelancer, arbitrator } = await loadFixture(deployFixture);
    const amounts = [A, B];
    const total = A + B;

    await expect(escrow.connect(client).createJob(freelancer.address, ZERO, amounts, DEFAULT_TIMELOCK, { value: total }))
      .to.emit(escrow, "JobCreated")
      .withArgs(1n, client.address, freelancer.address, ZERO, total, 2n, DEFAULT_TIMELOCK);

    const job = await escrow.getJob(1n);
    expect(job.client).to.equal(client.address);
    expect(job.freelancer).to.equal(freelancer.address);
    expect(job.token).to.equal(ZERO);
    expect(job.arbitrator).to.equal(arbitrator.address); // snapshotted global arbitrator
    expect(job.state).to.equal(JS.FUNDED);
    expect(job.milestoneCount).to.equal(2n);
    expect(job.approvedCount).to.equal(0n);
    expect(job.totalAmount).to.equal(total);

    const ms = await escrow.getMilestones(1n);
    expect(ms.length).to.equal(2);
    expect(ms[0].amount).to.equal(A);
    expect(ms[0].state).to.equal(MS.PENDING);
    expect(ms[1].amount).to.equal(B);
  });

  it("locks the funds in the contract", async function () {
    const { escrow, client, freelancer } = await loadFixture(deployFixture);
    const total = A + B;
    await expect(
      escrow.connect(client).createJob(freelancer.address, ZERO, [A, B], DEFAULT_TIMELOCK, { value: total }),
    ).to.changeEtherBalances([client, escrow], [-total, total]);
  });

  it("assigns sequential job ids starting at 1", async function () {
    const { escrow, client, freelancer } = await loadFixture(deployFixture);
    const first = await createFundedJob(escrow, client, freelancer, [A]);
    const second = await createFundedJob(escrow, client, freelancer, [B]);
    expect(first.jobId).to.equal(1n);
    expect(second.jobId).to.equal(2n);
    expect(await escrow.jobCounter()).to.equal(2n);
  });

  it("reverts on zero freelancer", async function () {
    const { escrow, client } = await loadFixture(deployFixture);
    await expect(
      escrow.connect(client).createJob(ZERO, ZERO, [A], DEFAULT_TIMELOCK, { value: A }),
    ).to.be.revertedWithCustomError(escrow, "ZeroAddress");
  });

  it("reverts on self-dealing (client == freelancer)", async function () {
    const { escrow, client } = await loadFixture(deployFixture);
    await expect(
      escrow.connect(client).createJob(client.address, ZERO, [A], DEFAULT_TIMELOCK, { value: A }),
    ).to.be.revertedWithCustomError(escrow, "SelfDealing");
  });

  it("reverts on a non-ETH token (Phase 10 lifts this)", async function () {
    const { escrow, client, freelancer, other } = await loadFixture(deployFixture);
    await expect(
      escrow.connect(client).createJob(freelancer.address, other.address, [A], DEFAULT_TIMELOCK, { value: A }),
    ).to.be.revertedWithCustomError(escrow, "TokenNotSupported");
  });

  it("reverts on zero milestones", async function () {
    const { escrow, client, freelancer } = await loadFixture(deployFixture);
    await expect(
      escrow.connect(client).createJob(freelancer.address, ZERO, [], DEFAULT_TIMELOCK, { value: 0 }),
    ).to.be.revertedWithCustomError(escrow, "NoMilestones");
  });

  it("reverts on too many milestones (> MAX_MILESTONES)", async function () {
    const { escrow, client, freelancer } = await loadFixture(deployFixture);
    const amounts = new Array(51).fill(1n) as bigint[];
    await expect(
      escrow.connect(client).createJob(freelancer.address, ZERO, amounts, DEFAULT_TIMELOCK, { value: 51n }),
    ).to.be.revertedWithCustomError(escrow, "TooManyMilestones");
  });

  it("reverts on a zero-amount milestone", async function () {
    const { escrow, client, freelancer } = await loadFixture(deployFixture);
    await expect(
      escrow.connect(client).createJob(freelancer.address, ZERO, [A, 0n], DEFAULT_TIMELOCK, { value: A }),
    ).to.be.revertedWithCustomError(escrow, "ZeroMilestoneAmount");
  });

  it("reverts when msg.value != sum(amounts)", async function () {
    const { escrow, client, freelancer } = await loadFixture(deployFixture);
    await expect(
      escrow.connect(client).createJob(freelancer.address, ZERO, [A, B], DEFAULT_TIMELOCK, { value: A }),
    )
      .to.be.revertedWithCustomError(escrow, "ValueMismatch")
      .withArgs(A + B, A);
  });

  it("reverts on out-of-range timelock (too low and too high)", async function () {
    const { escrow, client, freelancer } = await loadFixture(deployFixture);
    await expect(
      escrow.connect(client).createJob(freelancer.address, ZERO, [A], 60, { value: A }),
    ).to.be.revertedWithCustomError(escrow, "TimelockOutOfRange");
    await expect(
      escrow.connect(client).createJob(freelancer.address, ZERO, [A], 91 * 24 * 60 * 60, { value: A }),
    ).to.be.revertedWithCustomError(escrow, "TimelockOutOfRange");
  });

  it("reverts when paused", async function () {
    const { escrow, owner, client, freelancer } = await loadFixture(deployFixture);
    await escrow.connect(owner).pause();
    await expect(
      escrow.connect(client).createJob(freelancer.address, ZERO, [A], DEFAULT_TIMELOCK, { value: A }),
    ).to.be.revertedWithCustomError(escrow, "EnforcedPause");
  });
});
