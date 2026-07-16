// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {FreelanceEscrow} from "../../../contracts/FreelanceEscrow.sol";
import {MockV3Aggregator} from "@chainlink/contracts/src/v0.8/shared/mocks/MockV3Aggregator.sol";

/// @title EscrowHandler
/// @notice Bounded, stateful actor for the FreelanceEscrow invariant suite. The fuzzer
///         calls the `external` actions below in random order with random inputs; each
///         action maps random data onto a VALID actor/job and `try/catch`es the escrow
///         call so that reverts (the common case for random state) are simply discarded
///         (`fail_on_revert = false`). Ghost variables accumulate only on SUCCESS, giving
///         the invariants an independent model of how much ETH the escrow should hold.
/// @dev The handler DEPLOYS the escrow in its constructor, so it is the `owner` and can
///      exercise owner-only functions (`setFeeBps`, `withdrawFees`) directly. Role-gated
///      calls (client/freelancer/arbitrator) are made through `vm.prank`.
contract EscrowHandler is Test {
    FreelanceEscrow public escrow;

    // Fixed actor set — any can be a client or freelancer; one dedicated arbitrator.
    address[4] public actors;
    address public constant ARBITRATOR = address(0xA5B1);
    address public constant FEE_SINK = address(0xF335); // where withdrawn fees land (not the escrow)

    uint16 internal constant INITIAL_FEE_BPS = 100; // 1%

    uint256[] public jobIds; // every jobId ever created

    // --- Ghost accounting (the invariants' independent model) ---
    uint256 public ghost_totalDeposited; // ETH funded into the escrow via createJob
    uint256 public ghost_totalWithdrawn; // ETH paid out via withdraw()
    uint256 public ghost_totalFeesWithdrawn; // ETH paid out via withdrawFees()

    constructor() {
        MockV3Aggregator feed = new MockV3Aggregator(8, 2000e8);
        escrow = new FreelanceEscrow(INITIAL_FEE_BPS, ARBITRATOR, address(feed));
        actors[0] = address(0xC1);
        actors[1] = address(0xC2);
        actors[2] = address(0xC3);
        actors[3] = address(0xC4);
    }

    // Sum of every actor's withdrawable ETH balance — used by the solvency invariant.
    function sumPendingWithdrawals() external view returns (uint256 sum) {
        for (uint256 i = 0; i < actors.length; i++) {
            sum += escrow.pendingWithdrawals(address(0), actors[i]);
        }
    }

    function jobCount() external view returns (uint256) {
        return jobIds.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _job(uint256 seed) internal view returns (uint256) {
        if (jobIds.length == 0) return 0;
        return jobIds[seed % jobIds.length];
    }

    // --- Actions -----------------------------------------------------------

    function createJob(uint256 clientSeed, uint256 freelancerSeed, uint256 nSeed, uint256 amtSeed) external {
        address client = _actor(clientSeed);
        address freelancer = _actor(freelancerSeed);
        if (client == freelancer) return; // SelfDealing guard would reject

        uint256 n = bound(nSeed, 1, 5);
        uint128[] memory amounts = new uint128[](n);
        uint256 total;
        for (uint256 i = 0; i < n; i++) {
            uint128 a = uint128(bound(uint256(keccak256(abi.encode(amtSeed, i))), 1, 10 ether));
            amounts[i] = a;
            total += a;
        }

        // For a pranked payable call the wei is drawn from THIS handler's balance
        // (prank only overrides msg.sender), so fund the handler, not the client.
        vm.deal(address(this), total);
        vm.prank(client);
        try escrow.createJob{value: total}(freelancer, address(0), address(0), amounts, 1 days) returns (uint256 jobId) {
            jobIds.push(jobId);
            ghost_totalDeposited += total;
        } catch {}
    }

    function acceptJob(uint256 jobSeed) external {
        uint256 jobId = _job(jobSeed);
        if (jobId == 0) return;
        address freelancer = escrow.getJob(jobId).freelancer;
        vm.prank(freelancer);
        try escrow.acceptJob(jobId) {} catch {}
    }

    function submitMilestone(uint256 jobSeed, uint256 mSeed) external {
        uint256 jobId = _job(jobSeed);
        if (jobId == 0) return;
        FreelanceEscrow.Job memory job = escrow.getJob(jobId);
        if (job.milestoneCount == 0) return;
        uint256 mIndex = mSeed % job.milestoneCount;
        vm.prank(job.freelancer);
        try escrow.submitMilestone(jobId, mIndex, "cid") {} catch {}
    }

    function approveMilestone(uint256 jobSeed, uint256 mSeed) external {
        uint256 jobId = _job(jobSeed);
        if (jobId == 0) return;
        FreelanceEscrow.Job memory job = escrow.getJob(jobId);
        if (job.milestoneCount == 0) return;
        uint256 mIndex = mSeed % job.milestoneCount;
        vm.prank(job.client);
        try escrow.approveMilestone(jobId, mIndex) {} catch {}
    }

    function rejectMilestone(uint256 jobSeed, uint256 mSeed) external {
        uint256 jobId = _job(jobSeed);
        if (jobId == 0) return;
        FreelanceEscrow.Job memory job = escrow.getJob(jobId);
        if (job.milestoneCount == 0) return;
        uint256 mIndex = mSeed % job.milestoneCount;
        vm.prank(job.client);
        try escrow.rejectMilestone(jobId, mIndex, "no") {} catch {}
    }

    function raiseDispute(uint256 jobSeed, uint256 mSeed, bool asClient) external {
        uint256 jobId = _job(jobSeed);
        if (jobId == 0) return;
        FreelanceEscrow.Job memory job = escrow.getJob(jobId);
        if (job.milestoneCount == 0) return;
        uint256 mIndex = mSeed % job.milestoneCount;
        vm.prank(asClient ? job.client : job.freelancer);
        try escrow.raiseDispute(jobId, mIndex, "ev") {} catch {}
    }

    function resolveDispute(uint256 jobSeed, uint256 mSeed, uint256 bpsSeed) external {
        uint256 jobId = _job(jobSeed);
        if (jobId == 0) return;
        FreelanceEscrow.Job memory job = escrow.getJob(jobId);
        if (job.milestoneCount == 0) return;
        uint256 mIndex = mSeed % job.milestoneCount;
        uint16 bps = uint16(bound(bpsSeed, 0, 10_000));
        vm.prank(job.arbitrator);
        try escrow.resolveDispute(jobId, mIndex, bps) {} catch {}
    }

    function claimTimelockRelease(uint256 jobSeed, uint256 mSeed, uint256 warpSeed) external {
        uint256 jobId = _job(jobSeed);
        if (jobId == 0) return;
        FreelanceEscrow.Job memory job = escrow.getJob(jobId);
        if (job.milestoneCount == 0) return;
        uint256 mIndex = mSeed % job.milestoneCount;
        vm.warp(block.timestamp + bound(warpSeed, 0, 3 days));
        try escrow.claimTimelockRelease(jobId, mIndex) {} catch {}
    }

    function cancelJob(uint256 jobSeed) external {
        uint256 jobId = _job(jobSeed);
        if (jobId == 0) return;
        address client = escrow.getJob(jobId).client;
        vm.prank(client);
        try escrow.cancelJob(jobId) {} catch {}
    }

    function withdraw(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 amount = escrow.pendingWithdrawals(address(0), actor);
        if (amount == 0) return;
        vm.prank(actor);
        try escrow.withdraw(address(0)) {
            ghost_totalWithdrawn += amount;
        } catch {}
    }

    function withdrawFees() external {
        uint256 amount = escrow.accruedFees(address(0));
        if (amount == 0) return;
        // handler is owner
        try escrow.withdrawFees(address(0), FEE_SINK) {
            ghost_totalFeesWithdrawn += amount;
        } catch {}
    }

    function setFeeBps(uint256 bpsSeed) external {
        // Deliberately UNBOUNDED (may exceed the cap) to prove the guard holds.
        uint16 bps = uint16(bpsSeed % 65_536);
        try escrow.setFeeBps(bps) {} catch {}
    }
}
