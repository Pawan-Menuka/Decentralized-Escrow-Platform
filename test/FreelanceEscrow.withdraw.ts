import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, createFundedJob, feeOf, ZERO } from "./helpers";

describe("FreelanceEscrow — withdraw (Phase 2)", function () {
  const A = ethers.parseEther("1");

  async function approvedFixture() {
    const base = await loadFixture(deployFixture);
    const { escrow, client, freelancer } = base;
    await createFundedJob(escrow, client, freelancer, [A]);
    await escrow.connect(freelancer).acceptJob(1n);
    await escrow.connect(freelancer).submitMilestone(1n, 0n, "cid");
    await escrow.connect(client).approveMilestone(1n, 0n);
    return base;
  }

  it("pays out the credited ETH balance and zeroes it, emitting Withdrawal", async function () {
    const { escrow, freelancer } = await approvedFixture();
    const { net } = feeOf(A);

    await expect(escrow.connect(freelancer).withdraw(ZERO)).to.changeEtherBalance(freelancer, net);
    expect(await escrow.pendingWithdrawals(ZERO, freelancer.address)).to.equal(0n);
  });

  it("emits Withdrawal with the correct args", async function () {
    const { escrow, freelancer } = await approvedFixture();
    const { net } = feeOf(A);
    await expect(escrow.connect(freelancer).withdraw(ZERO))
      .to.emit(escrow, "Withdrawal")
      .withArgs(freelancer.address, ZERO, net);
  });

  it("works even while the contract is paused (funds must stay exitable)", async function () {
    const { escrow, owner, freelancer } = await approvedFixture();
    await escrow.connect(owner).pause();
    const { net } = feeOf(A);
    await expect(escrow.connect(freelancer).withdraw(ZERO)).to.changeEtherBalance(freelancer, net);
  });

  it("reverts with NothingToWithdraw when balance is zero", async function () {
    const { escrow, other } = await loadFixture(deployFixture);
    await expect(escrow.connect(other).withdraw(ZERO)).to.be.revertedWithCustomError(escrow, "NothingToWithdraw");
  });

  it("second withdraw reverts (balance already drained)", async function () {
    const { escrow, freelancer } = await approvedFixture();
    await escrow.connect(freelancer).withdraw(ZERO);
    await expect(escrow.connect(freelancer).withdraw(ZERO)).to.be.revertedWithCustomError(escrow, "NothingToWithdraw");
  });

  it("reverts withdrawing a non-ETH token (Phase 10 enables this)", async function () {
    const { escrow, other, freelancer } = await approvedFixture();
    // A non-zero token has no possible balance in Phase 2, so this reverts NothingToWithdraw
    // for an account with no credit — assert the guard ordering by using the credited account:
    await expect(escrow.connect(freelancer).withdraw(other.address)).to.be.revertedWithCustomError(
      escrow,
      "NothingToWithdraw",
    );
  });
});
