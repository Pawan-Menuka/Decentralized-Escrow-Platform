import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, feeOf, ZERO, JS, MS, DEFAULT_TIMELOCK } from "./helpers";

describe("FreelanceEscrow — ERC-20/USDC support (Phase 10)", function () {
  // 6-decimal token amounts (mirrors USDC), like `1_000_000_000n` == 1,000 mUSDC.
  const A = 1_000_000_000n; // 1,000.000000
  const B = 2_000_000_000n; // 2,000.000000
  const SUPPLY = 1_000_000_000_000n; // 1,000,000.000000

  async function tokenFixture() {
    const base = await loadFixture(deployFixture);
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy(SUPPLY);
    await token.waitForDeployment();
    return { ...base, token };
  }

  /** Mints `total` to the client and approves the escrow, then creates a token job. */
  async function createFundedTokenJob(
    escrow: any,
    token: any,
    client: any,
    freelancer: any,
    amounts: bigint[],
    timelock: number = DEFAULT_TIMELOCK,
  ): Promise<{ jobId: bigint; total: bigint }> {
    const total = amounts.reduce((a, b) => a + b, 0n);
    await token.mint(client.address, total);
    const tokenAddress = await token.getAddress();
    await token.connect(client).approve(await escrow.getAddress(), total);
    const jobId = (await escrow.jobCounter()) + 1n;
    await escrow.connect(client).createJob(freelancer.address, ZERO, tokenAddress, amounts, timelock);
    return { jobId, total };
  }

  describe("full lifecycle", function () {
    it("creates, accepts, submits, approves, and withdraws in the token, with correct fee accounting", async function () {
      const { escrow, token, client, freelancer } = await tokenFixture();
      const tokenAddress = await token.getAddress();
      const { jobId, total } = await createFundedTokenJob(escrow, token, client, freelancer, [A, B]);

      // funds actually pulled into the escrow
      expect(await token.balanceOf(await escrow.getAddress())).to.equal(total);
      expect(await token.balanceOf(client.address)).to.equal(0n);

      const job = await escrow.getJob(jobId);
      expect(job.token).to.equal(tokenAddress);
      expect(job.totalAmount).to.equal(total);
      expect(job.state).to.equal(JS.FUNDED);

      await escrow.connect(freelancer).acceptJob(jobId);
      await escrow.connect(freelancer).submitMilestone(jobId, 0n, "cid-0");

      const { fee, net } = feeOf(A);
      await expect(escrow.connect(client).approveMilestone(jobId, 0n))
        .to.emit(escrow, "MilestoneApproved")
        .withArgs(jobId, 0n, A, fee);

      expect(await escrow.pendingWithdrawals(tokenAddress, freelancer.address)).to.equal(net);
      expect(await escrow.accruedFees(tokenAddress)).to.equal(fee);

      await expect(escrow.connect(freelancer).withdraw(tokenAddress)).to.changeTokenBalances(
        token,
        [freelancer, escrow],
        [net, -net],
      );
      expect(await escrow.pendingWithdrawals(tokenAddress, freelancer.address)).to.equal(0n);
    });

    it("second milestone completes the job and fees are withdrawable by the owner", async function () {
      const { escrow, token, owner, client, freelancer } = await tokenFixture();
      const tokenAddress = await token.getAddress();
      const { jobId } = await createFundedTokenJob(escrow, token, client, freelancer, [A, B]);
      await escrow.connect(freelancer).acceptJob(jobId);
      await escrow.connect(freelancer).submitMilestone(jobId, 0n, "cid-0");
      await escrow.connect(freelancer).submitMilestone(jobId, 1n, "cid-1");
      await escrow.connect(client).approveMilestone(jobId, 0n);
      await escrow.connect(client).approveMilestone(jobId, 1n);

      expect((await escrow.getJob(jobId)).state).to.equal(JS.COMPLETED);

      const { fee: feeA } = feeOf(A);
      const { fee: feeB } = feeOf(B);
      const totalFee = feeA + feeB;
      expect(await escrow.accruedFees(tokenAddress)).to.equal(totalFee);

      await expect(escrow.connect(owner).withdrawFees(tokenAddress, owner.address)).to.changeTokenBalances(
        token,
        [owner, escrow],
        [totalFee, -totalFee],
      );
      expect(await escrow.accruedFees(tokenAddress)).to.equal(0n);
    });
  });

  describe("dispute split in the token", function () {
    it("splits an arbitrary bps between freelancer and client, both withdrawable in the token", async function () {
      const { escrow, owner, token, client, freelancer, arbitrator } = await tokenFixture();
      const tokenAddress = await token.getAddress();
      const { jobId } = await createFundedTokenJob(escrow, token, client, freelancer, [A]);
      await escrow.connect(freelancer).acceptJob(jobId);
      await escrow.connect(freelancer).submitMilestone(jobId, 0n, "cid");
      await escrow.connect(client).raiseDispute(jobId, 0n, "ev");

      const freelancerBps = 3000n; // 30%
      const freelancerGross = (A * freelancerBps) / 10_000n;
      const clientAmount = A - freelancerGross;
      const { fee, net: freelancerAmount } = feeOf(freelancerGross);

      await expect(escrow.connect(arbitrator).resolveDispute(jobId, 0n, freelancerBps))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(jobId, 0n, freelancerBps, freelancerAmount, clientAmount, fee);

      expect(await escrow.pendingWithdrawals(tokenAddress, freelancer.address)).to.equal(freelancerAmount);
      expect(await escrow.pendingWithdrawals(tokenAddress, client.address)).to.equal(clientAmount);
      expect(await escrow.accruedFees(tokenAddress)).to.equal(fee);

      await expect(escrow.connect(freelancer).withdraw(tokenAddress)).to.changeTokenBalances(
        token,
        [freelancer, escrow],
        [freelancerAmount, -freelancerAmount],
      );
      await expect(escrow.connect(client).withdraw(tokenAddress)).to.changeTokenBalances(
        token,
        [client, escrow],
        [clientAmount, -clientAmount],
      );
      await expect(escrow.connect(owner).withdrawFees(tokenAddress, owner.address)).to.changeTokenBalances(
        token,
        [owner, escrow],
        [fee, -fee],
      );
    });
  });

  describe("cancel refund in the token", function () {
    it("refunds the client in full, no fee, pre-acceptance", async function () {
      const { escrow, token, client, freelancer } = await tokenFixture();
      const tokenAddress = await token.getAddress();
      const { jobId, total } = await createFundedTokenJob(escrow, token, client, freelancer, [A, B]);

      await expect(escrow.connect(client).cancelJob(jobId)).to.emit(escrow, "JobCancelled").withArgs(jobId);
      expect((await escrow.getJob(jobId)).state).to.equal(JS.CANCELLED);
      expect(await escrow.pendingWithdrawals(tokenAddress, client.address)).to.equal(total);
      expect(await escrow.accruedFees(tokenAddress)).to.equal(0n);

      await expect(escrow.connect(client).withdraw(tokenAddress)).to.changeTokenBalances(
        token,
        [client, escrow],
        [total, -total],
      );
    });
  });

  describe("fee-on-transfer rejection", function () {
    it("createJob reverts TokenAmountMismatch when the token withholds a transfer fee", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      const FeeOnTransferERC20 = await ethers.getContractFactory("FeeOnTransferERC20");
      const fot = await FeeOnTransferERC20.deploy(SUPPLY);
      await fot.waitForDeployment();
      const fotAddress = await fot.getAddress();

      // owner's own transfer to the client ALSO withholds 1%, so send extra and read back
      // the client's actual (post-fee) balance rather than assuming it equals `A`.
      await fot.transfer(client.address, A * 2n);
      const clientBalance = await fot.balanceOf(client.address);
      await (fot.connect(client) as typeof fot).approve(await escrow.getAddress(), clientBalance);

      const expectedReceived = clientBalance - clientBalance / 100n; // 1% withheld again on transferFrom
      await expect(
        escrow.connect(client).createJob(freelancer.address, ZERO, fotAddress, [clientBalance], DEFAULT_TIMELOCK),
      )
        .to.be.revertedWithCustomError(escrow, "TokenAmountMismatch")
        .withArgs(clientBalance, expectedReceived);
    });
  });

  describe("coexistence: ETH job and token job in the same contract", function () {
    it("keeps balances and fees independent per token", async function () {
      const { escrow, token, client, freelancer } = await tokenFixture();
      const tokenAddress = await token.getAddress();
      const ethAmount = ethers.parseEther("1");

      // ETH job
      const ethJobId = (await escrow.jobCounter()) + 1n;
      await escrow.connect(client).createJob(freelancer.address, ZERO, ZERO, [ethAmount], DEFAULT_TIMELOCK, {
        value: ethAmount,
      });

      // Token job
      const { jobId: tokenJobId } = await createFundedTokenJob(escrow, token, client, freelancer, [A]);

      await escrow.connect(freelancer).acceptJob(ethJobId);
      await escrow.connect(freelancer).acceptJob(tokenJobId);
      await escrow.connect(freelancer).submitMilestone(ethJobId, 0n, "cid-eth");
      await escrow.connect(freelancer).submitMilestone(tokenJobId, 0n, "cid-token");
      await escrow.connect(client).approveMilestone(ethJobId, 0n);
      await escrow.connect(client).approveMilestone(tokenJobId, 0n);

      const { fee: ethFee, net: ethNet } = feeOf(ethAmount);
      const { fee: tokenFee, net: tokenNet } = feeOf(A);

      expect(await escrow.pendingWithdrawals(ZERO, freelancer.address)).to.equal(ethNet);
      expect(await escrow.pendingWithdrawals(tokenAddress, freelancer.address)).to.equal(tokenNet);
      expect(await escrow.accruedFees(ZERO)).to.equal(ethFee);
      expect(await escrow.accruedFees(tokenAddress)).to.equal(tokenFee);

      // withdrawing one token does not touch the other's balance
      await expect(escrow.connect(freelancer).withdraw(ZERO)).to.changeEtherBalance(freelancer, ethNet);
      expect(await escrow.pendingWithdrawals(tokenAddress, freelancer.address)).to.equal(tokenNet);

      await expect(escrow.connect(freelancer).withdraw(tokenAddress)).to.changeTokenBalances(
        token,
        [freelancer, escrow],
        [tokenNet, -tokenNet],
      );
      expect(await escrow.pendingWithdrawals(ZERO, freelancer.address)).to.equal(0n);
    });
  });

  describe("guards", function () {
    it("reverts createJob for a token with nonzero msg.value", async function () {
      const { escrow, token, client, freelancer } = await tokenFixture();
      const tokenAddress = await token.getAddress();
      await token.mint(client.address, A);
      await (token.connect(client) as typeof token).approve(await escrow.getAddress(), A);
      await expect(
        escrow.connect(client).createJob(freelancer.address, ZERO, tokenAddress, [A], DEFAULT_TIMELOCK, { value: 1n }),
      )
        .to.be.revertedWithCustomError(escrow, "ValueMismatch")
        .withArgs(0n, 1n);
    });
  });
});
