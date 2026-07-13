import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
  deployFixture,
  feeOf,
  usd,
  usdToWei,
  ETH_USD_PRICE,
  DEFAULT_TIMELOCK,
  ZERO,
  JS,
  MS,
} from "./helpers";

describe("FreelanceEscrow — createJobUsd / price feed (Phase 8)", function () {
  describe("conversion", function () {
    it("converts a USD milestone to ETH at the feed price ($500 @ $2000 = 0.25 ETH)", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      const usdAmt = usd(500);
      const expectedWei = usdToWei(usdAmt); // 0.25 ETH
      expect(expectedWei).to.equal(ethers.parseEther("0.25"));

      await expect(
        escrow.connect(client).createJobUsd(freelancer.address, [usdAmt], DEFAULT_TIMELOCK, { value: expectedWei }),
      )
        .to.emit(escrow, "JobCreated")
        .withArgs(1n, client.address, freelancer.address, ZERO, expectedWei, 1n, DEFAULT_TIMELOCK)
        .and.to.emit(escrow, "JobCreatedUsd")
        .withArgs(1n, usdAmt, ETH_USD_PRICE);

      const job = await escrow.getJob(1n);
      expect(job.totalAmount).to.equal(expectedWei);
      expect(job.token).to.equal(ZERO);
      expect((await escrow.getMilestone(1n, 0n)).amount).to.equal(expectedWei);
    });

    it("converts multiple milestones and locks the exact ETH total", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      const amounts = [usd(1000), usd(250)]; // 0.5 + 0.125 = 0.625 ETH
      const total = amounts.reduce((s, a) => s + usdToWei(a), 0n);
      expect(total).to.equal(ethers.parseEther("0.625"));

      await expect(
        escrow.connect(client).createJobUsd(freelancer.address, amounts, DEFAULT_TIMELOCK, { value: total }),
      ).to.changeEtherBalances([client, escrow], [-total, total]);
    });

    it("reflects a different feed price ($2500 => $500 is 0.2 ETH)", async function () {
      const { escrow, feed, client, freelancer } = await loadFixture(deployFixture);
      const newPrice = 2500n * 10n ** 8n;
      await feed.updateAnswer(newPrice);
      const usdAmt = usd(500);
      const expectedWei = usdToWei(usdAmt, newPrice); // 0.2 ETH
      expect(expectedWei).to.equal(ethers.parseEther("0.2"));

      await escrow.connect(client).createJobUsd(freelancer.address, [usdAmt], DEFAULT_TIMELOCK, { value: expectedWei });
      expect((await escrow.getMilestone(1n, 0n)).amount).to.equal(expectedWei);
    });

    it("reverts when msg.value != the converted ETH total", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      const usdAmt = usd(500);
      const correct = usdToWei(usdAmt);
      await expect(
        escrow.connect(client).createJobUsd(freelancer.address, [usdAmt], DEFAULT_TIMELOCK, { value: correct - 1n }),
      )
        .to.be.revertedWithCustomError(escrow, "ValueMismatch")
        .withArgs(correct, correct - 1n);
    });
  });

  describe("price validation", function () {
    it("reverts StalePrice when the feed answer is older than the threshold", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      // feed was last updated at deploy; advance chain time > 1 hour to make it stale
      await time.increase(3601);
      const usdAmt = usd(500);
      await expect(
        escrow
          .connect(client)
          .createJobUsd(freelancer.address, [usdAmt], DEFAULT_TIMELOCK, { value: usdToWei(usdAmt) }),
      ).to.be.revertedWithCustomError(escrow, "StalePrice");
    });

    it("a fresh update makes the feed usable again", async function () {
      const { escrow, feed, client, freelancer } = await loadFixture(deployFixture);
      await time.increase(3601); // now stale
      await feed.updateAnswer(ETH_USD_PRICE); // refreshes updatedAt to now
      const usdAmt = usd(500);
      await expect(
        escrow
          .connect(client)
          .createJobUsd(freelancer.address, [usdAmt], DEFAULT_TIMELOCK, { value: usdToWei(usdAmt) }),
      ).to.emit(escrow, "JobCreated");
    });

    it("reverts InvalidPrice when the feed answer is zero", async function () {
      const { escrow, feed, client, freelancer } = await loadFixture(deployFixture);
      await feed.updateAnswer(0);
      await expect(
        escrow.connect(client).createJobUsd(freelancer.address, [usd(500)], DEFAULT_TIMELOCK, { value: 1n }),
      ).to.be.revertedWithCustomError(escrow, "InvalidPrice");
    });

    it("reverts InvalidPrice when the feed answer is negative", async function () {
      const { escrow, feed, client, freelancer } = await loadFixture(deployFixture);
      await feed.updateAnswer(-1);
      await expect(
        escrow.connect(client).createJobUsd(freelancer.address, [usd(500)], DEFAULT_TIMELOCK, { value: 1n }),
      ).to.be.revertedWithCustomError(escrow, "InvalidPrice");
    });
  });

  describe("guards mirror createJob", function () {
    it("reverts on self-dealing", async function () {
      const { escrow, client } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(client).createJobUsd(client.address, [usd(500)], DEFAULT_TIMELOCK, { value: usdToWei(usd(500)) }),
      ).to.be.revertedWithCustomError(escrow, "SelfDealing");
    });

    it("reverts on zero milestones", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(client).createJobUsd(freelancer.address, [], DEFAULT_TIMELOCK, { value: 0 }),
      ).to.be.revertedWithCustomError(escrow, "NoMilestones");
    });

    it("reverts on out-of-range timelock", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(client).createJobUsd(freelancer.address, [usd(500)], 60, { value: usdToWei(usd(500)) }),
      ).to.be.revertedWithCustomError(escrow, "TimelockOutOfRange");
    });

    it("reverts when paused", async function () {
      const { escrow, owner, client, freelancer } = await loadFixture(deployFixture);
      await escrow.connect(owner).pause();
      await expect(
        escrow
          .connect(client)
          .createJobUsd(freelancer.address, [usd(500)], DEFAULT_TIMELOCK, { value: usdToWei(usd(500)) }),
      ).to.be.revertedWithCustomError(escrow, "EnforcedPause");
    });
  });

  describe("a USD job is a normal ETH job afterward", function () {
    it("accepts, submits, approves, and pays out net-of-fee", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      const usdAmt = usd(1000);
      const wei = usdToWei(usdAmt); // 0.5 ETH
      await escrow.connect(client).createJobUsd(freelancer.address, [usdAmt], DEFAULT_TIMELOCK, { value: wei });

      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid");
      await escrow.connect(client).approveMilestone(1n, 0n);

      const { net } = feeOf(wei);
      expect(await escrow.pendingWithdrawals(ZERO, freelancer.address)).to.equal(net);
      expect((await escrow.getJob(1n)).state).to.equal(JS.COMPLETED);
      expect((await escrow.getMilestone(1n, 0n)).state).to.equal(MS.APPROVED);
      await expect(escrow.connect(freelancer).withdraw(ZERO)).to.changeEtherBalance(freelancer, net);
    });
  });
});
