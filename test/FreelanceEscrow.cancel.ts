import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, createFundedJob, ZERO, JS } from "./helpers";

describe("FreelanceEscrow — cancelJob (Phase 3)", function () {
  const A = ethers.parseEther("1");
  const B = ethers.parseEther("2");

  it("client cancels a funded (pre-acceptance) job and is refunded in full via pull-payment", async function () {
    const { escrow, client, freelancer } = await loadFixture(deployFixture);
    await createFundedJob(escrow, client, freelancer, [A, B]);

    await expect(escrow.connect(client).cancelJob(1n)).to.emit(escrow, "JobCancelled").withArgs(1n);
    expect((await escrow.getJob(1n)).state).to.equal(JS.CANCELLED);

    // full refund, no fee
    expect(await escrow.pendingWithdrawals(ZERO, client.address)).to.equal(A + B);
    expect(await escrow.accruedFees(ZERO)).to.equal(0n);

    // and the client can actually withdraw it back
    await expect(escrow.connect(client).withdraw(ZERO)).to.changeEtherBalance(client, A + B);
  });

  it("reverts for a non-client", async function () {
    const { escrow, client, freelancer } = await loadFixture(deployFixture);
    await createFundedJob(escrow, client, freelancer, [A]);
    await expect(escrow.connect(freelancer).cancelJob(1n)).to.be.revertedWithCustomError(escrow, "NotClient");
  });

  it("reverts once the job has been accepted (no longer FUNDED)", async function () {
    const { escrow, client, freelancer } = await loadFixture(deployFixture);
    await createFundedJob(escrow, client, freelancer, [A]);
    await escrow.connect(freelancer).acceptJob(1n);
    await expect(escrow.connect(client).cancelJob(1n))
      .to.be.revertedWithCustomError(escrow, "InvalidJobState")
      .withArgs(JS.IN_PROGRESS);
  });

  it("reverts for a non-existent job", async function () {
    const { escrow, client } = await loadFixture(deployFixture);
    await expect(escrow.connect(client).cancelJob(42n)).to.be.revertedWithCustomError(escrow, "JobNotFound");
  });
});
