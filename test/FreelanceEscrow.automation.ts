import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, createFundedJob, feeOf, DEFAULT_TIMELOCK, ZERO, JS, MS } from "./helpers";

const coder = ethers.AbiCoder.defaultAbiCoder();

/** Packed scan-set key, mirroring the contract's _key(jobId, mIndex). */
function key(jobId: bigint, mIndex: bigint): bigint {
  return (jobId << 32n) | mIndex;
}
function decodeKeys(performData: string): bigint[] {
  return coder.decode(["uint256[]"], performData)[0] as bigint[];
}

describe("FreelanceEscrow — Chainlink Automation (Phase 9)", function () {
  const A = ethers.parseEther("1");
  const B = ethers.parseEther("2");

  /** Job accepted with milestone 0 submitted (still within timelock). */
  async function submittedFixture() {
    const base = await loadFixture(deployFixture);
    const { escrow, client, freelancer } = base;
    await createFundedJob(escrow, client, freelancer, [A, B]);
    await escrow.connect(freelancer).acceptJob(1n);
    await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid-0");
    return base;
  }

  describe("checkUpkeep", function () {
    it("returns false when nothing is submitted", async function () {
      const { escrow } = await loadFixture(deployFixture);
      const [needed] = await escrow.checkUpkeep("0x");
      expect(needed).to.equal(false);
    });

    it("returns false while a submitted milestone is still within its timelock", async function () {
      const { escrow } = await submittedFixture();
      const [needed] = await escrow.checkUpkeep("0x");
      expect(needed).to.equal(false);
    });

    it("returns true and the expired key once the timelock passes", async function () {
      const { escrow } = await submittedFixture();
      await time.increase(DEFAULT_TIMELOCK + 1);
      const [needed, data] = await escrow.checkUpkeep("0x");
      expect(needed).to.equal(true);
      expect(decodeKeys(data)).to.deep.equal([key(1n, 0n)]);
    });

    it("does not report a disputed milestone (it left the scan set)", async function () {
      const { escrow, client } = await submittedFixture();
      await escrow.connect(client).raiseDispute(1n, 0n, "ev");
      await time.increase(DEFAULT_TIMELOCK + 1);
      const [needed] = await escrow.checkUpkeep("0x");
      expect(needed).to.equal(false);
    });

    it("batches at most UPKEEP_BATCH_LIMIT (10) keys", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      const amounts = new Array(11).fill(ethers.parseEther("0.01")) as bigint[];
      await createFundedJob(escrow, client, freelancer, amounts);
      await escrow.connect(freelancer).acceptJob(1n);
      for (let i = 0; i < 11; i++) await escrow.connect(freelancer).submitMilestone(1n, i, `cid-${i}`);
      await time.increase(DEFAULT_TIMELOCK + 1);

      const [needed, data] = await escrow.checkUpkeep("0x");
      expect(needed).to.equal(true);
      expect(decodeKeys(data).length).to.equal(10); // capped
    });
  });

  describe("performUpkeep", function () {
    it("releases an expired milestone (credits freelancer, marks AUTO_RELEASED)", async function () {
      const { escrow, freelancer } = await submittedFixture();
      await time.increase(DEFAULT_TIMELOCK + 1);
      const [, data] = await escrow.checkUpkeep("0x");

      await expect(escrow.performUpkeep(data))
        .to.emit(escrow, "MilestoneAutoReleased")
        .withArgs(1n, 0n, A, feeOf(A).fee);

      expect((await escrow.getMilestone(1n, 0n)).state).to.equal(MS.AUTO_RELEASED);
      expect(await escrow.pendingWithdrawals(ZERO, freelancer.address)).to.equal(feeOf(A).net);
      expect(await escrow.activeSubmittedLength()).to.equal(0n);
    });

    it("is idempotent — a second call with the same data is a no-op", async function () {
      const { escrow } = await submittedFixture();
      await time.increase(DEFAULT_TIMELOCK + 1);
      const [, data] = await escrow.checkUpkeep("0x");
      await escrow.performUpkeep(data);
      // second call: milestone no longer SUBMITTED -> skipped, no revert, no double-credit
      await expect(escrow.performUpkeep(data)).to.not.emit(escrow, "MilestoneAutoReleased");
    });

    it("ignores forged data for a milestone that is NOT expired (re-validates on-chain)", async function () {
      const { escrow, freelancer } = await submittedFixture();
      // craft performData pointing at milestone 0, which is submitted but NOT yet expired
      const forged = coder.encode(["uint256[]"], [[key(1n, 0n)]]);
      await escrow.performUpkeep(forged);
      expect((await escrow.getMilestone(1n, 0n)).state).to.equal(MS.SUBMITTED); // untouched
      expect(await escrow.pendingWithdrawals(ZERO, freelancer.address)).to.equal(0n);
    });

    it("ignores forged data for a non-existent job/milestone without reverting", async function () {
      const { escrow } = await loadFixture(deployFixture);
      const forged = coder.encode(["uint256[]"], [[key(999n, 7n)]]);
      await expect(escrow.performUpkeep(forged)).to.not.be.reverted;
    });

    it("completes the job when upkeep releases the last milestone", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await createFundedJob(escrow, client, freelancer, [A]);
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid");
      await time.increase(DEFAULT_TIMELOCK + 1);
      const [, data] = await escrow.checkUpkeep("0x");
      await escrow.performUpkeep(data);
      expect((await escrow.getJob(1n)).state).to.equal(JS.COMPLETED);
    });

    it("reverts when paused", async function () {
      const { escrow, owner } = await submittedFixture();
      await time.increase(DEFAULT_TIMELOCK + 1);
      const [, data] = await escrow.checkUpkeep("0x");
      await escrow.connect(owner).pause();
      await expect(escrow.performUpkeep(data)).to.be.revertedWithCustomError(escrow, "EnforcedPause");
    });
  });
});
