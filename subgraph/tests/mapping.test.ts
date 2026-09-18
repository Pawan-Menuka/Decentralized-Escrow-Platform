import { Address, BigInt, ethereum, store, ValueKind } from "@graphprotocol/graph-ts";
import { assert, clearStore, createMockedFunction, test } from "matchstick-as/assembly/index";
import { Job, Milestone } from "../generated/schema";
import {
  handleDisputeRaised,
  handleDisputeResolved,
  handleJobCancelled,
  handleJobCompleted,
  handleJobCreated,
  handleJobCreatedUsd,
  handleMilestoneApproved,
  handleMilestoneAutoReleased,
  handleMilestoneRejected,
  handleMilestoneSubmitted,
} from "../src/mapping";
import {
  disputeRaised,
  disputeResolved,
  jobCancelled,
  jobCompleted,
  jobCreated,
  jobCreatedUsd,
  milestoneApproved,
  milestoneAutoReleased,
  milestoneRejected,
  milestoneSubmitted,
} from "./event-factories";

const CONTRACT = "0x00000000000000000000000000000000000000aa";
const CLIENT = "0x0000000000000000000000000000000000000001";
const FREELANCER = "0x0000000000000000000000000000000000000002";
const ARBITRATOR = "0x0000000000000000000000000000000000000003";
const ZERO = "0x0000000000000000000000000000000000000000";

function seedJob(count: i32 = 2): void {
  let job = new Job("1");
  job.jobId = BigInt.fromI32(1);
  job.client = Address.fromString(CLIENT);
  job.freelancer = Address.fromString(FREELANCER);
  job.arbitrator = Address.fromString(ARBITRATOR);
  job.token = Address.fromString(ZERO);
  job.totalAmount = BigInt.fromI32(200);
  job.milestoneCount = BigInt.fromI32(count);
  job.approvedMilestoneCount = BigInt.zero();
  job.openDisputeCount = BigInt.zero();
  job.timelock = BigInt.fromI32(3600);
  job.state = "IN_PROGRESS";
  job.createdAt = BigInt.fromI32(100);
  job.updatedAt = BigInt.fromI32(100);
  job.arbitratorVerified = true;
  job.milestonesHydrated = true;
  job.save();
}

function seedMilestone(index: i32, state: string = "PENDING"): void {
  let milestone = new Milestone("1-" + index.toString());
  milestone.job = "1";
  milestone.index = BigInt.fromI32(index);
  milestone.amount = BigInt.fromI32(100);
  milestone.amountVerified = true;
  milestone.state = state;
  milestone.deliverableCid = null;
  milestone.submittedAt = null;
  milestone.fee = null;
  milestone.save();
}

function mockCreationReads(): void {
  let jobTuple = changetype<ethereum.Tuple>([
    ethereum.Value.fromAddress(Address.fromString(CLIENT)),
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(100)),
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(3600)),
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1)),
    ethereum.Value.fromAddress(Address.fromString(FREELANCER)),
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(2)),
    ethereum.Value.fromUnsignedBigInt(BigInt.zero()),
    ethereum.Value.fromAddress(Address.fromString(ZERO)),
    ethereum.Value.fromAddress(Address.fromString(ARBITRATOR)),
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(200)),
  ]);
  createMockedFunction(
    Address.fromString(CONTRACT),
    "getJob",
    "getJob(uint256):((address,uint48,uint32,uint8,address,uint16,uint16,address,address,uint256))",
  )
    .withArgs([ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))])
    .returns([ethereum.Value.fromTuple(jobTuple)]);

  let first = changetype<ethereum.Tuple>([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(75)),
    ethereum.Value.fromUnsignedBigInt(BigInt.zero()),
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1)),
    ethereum.Value.fromString(""),
  ]);
  let second = changetype<ethereum.Tuple>([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(125)),
    ethereum.Value.fromUnsignedBigInt(BigInt.zero()),
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1)),
    ethereum.Value.fromString(""),
  ]);
  createMockedFunction(
    Address.fromString(CONTRACT),
    "getMilestones",
    "getMilestones(uint256):((uint128,uint40,uint8,string)[])",
  )
    .withArgs([ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))])
    .returns([ethereum.Value.fromTupleArray([first, second])]);
}

test("creates and hydrates a job, milestones, arbitrator, and USD enrichment", () => {
  mockCreationReads();
  handleJobCreated(jobCreated(
    Address.fromString(CLIENT),
    Address.fromString(FREELANCER),
    Address.fromString(ZERO),
    200,
    2,
  ));
  handleJobCreatedUsd(jobCreatedUsd());

  assert.fieldEquals("Job", "1", "arbitrator", ARBITRATOR);
  assert.fieldEquals("Job", "1", "arbitratorVerified", "true");
  assert.fieldEquals("Job", "1", "milestonesHydrated", "true");
  assert.fieldEquals("Job", "1", "usdTotal", "50000");
  assert.fieldEquals("Milestone", "1-0", "amount", "75");
  assert.fieldEquals("Milestone", "1-1", "amount", "125");
  assert.fieldEquals("Milestone", "1-1", "amountVerified", "true");
  clearStore();
});

test("clears rejected submission data and supports resubmission", () => {
  seedJob(1);
  seedMilestone(0);
  handleMilestoneSubmitted(milestoneSubmitted(0, "bafy-first"));
  assert.fieldEquals("Milestone", "1-0", "state", "SUBMITTED");
  assert.fieldEquals("Milestone", "1-0", "deliverableCid", "bafy-first");

  handleMilestoneRejected(milestoneRejected(0));
  assert.fieldEquals("Milestone", "1-0", "state", "PENDING");
  assert.notInStore("Milestone", "missing");
  let rejected = store.get("Milestone", "1-0")!;
  assert.i32Equals(rejected.get("deliverableCid")!.kind, ValueKind.NULL);
  assert.i32Equals(rejected.get("submittedAt")!.kind, ValueKind.NULL);

  handleMilestoneSubmitted(milestoneSubmitted(0, "bafy-second", 202));
  assert.fieldEquals("Milestone", "1-0", "deliverableCid", "bafy-second");
  assert.fieldEquals("Milestone", "1-0", "submittedAt", "202");
  clearStore();
});

test("tracks approval and automatic release as terminal milestones", () => {
  seedJob(2);
  seedMilestone(0, "SUBMITTED");
  seedMilestone(1, "SUBMITTED");
  handleMilestoneApproved(milestoneApproved(0, 100));
  handleMilestoneAutoReleased(milestoneAutoReleased(1, 100));

  assert.fieldEquals("Milestone", "1-0", "state", "APPROVED");
  assert.fieldEquals("Milestone", "1-1", "state", "AUTO_RELEASED");
  assert.fieldEquals("Job", "1", "approvedMilestoneCount", "2");
  clearStore();
});

test("raises and resolves a single dispute", () => {
  seedJob(1);
  seedMilestone(0, "SUBMITTED");
  handleDisputeRaised(disputeRaised(0));
  assert.fieldEquals("Job", "1", "state", "DISPUTED");
  assert.fieldEquals("Job", "1", "openDisputeCount", "1");

  handleDisputeResolved(disputeResolved(0));
  assert.fieldEquals("Job", "1", "state", "IN_PROGRESS");
  assert.fieldEquals("Job", "1", "openDisputeCount", "0");
  assert.fieldEquals("Milestone", "1-0", "amount", "100");
  assert.fieldEquals("Dispute", "1-0", "resolved", "true");
  clearStore();
});

test("keeps a job disputed until concurrent disputes resolve in either order", () => {
  seedJob(2);
  seedMilestone(0, "SUBMITTED");
  seedMilestone(1, "SUBMITTED");
  handleDisputeRaised(disputeRaised(0));
  handleDisputeRaised(disputeRaised(1));
  assert.fieldEquals("Job", "1", "openDisputeCount", "2");

  handleDisputeResolved(disputeResolved(1));
  assert.fieldEquals("Job", "1", "state", "DISPUTED");
  assert.fieldEquals("Job", "1", "openDisputeCount", "1");
  handleDisputeResolved(disputeResolved(0));
  assert.fieldEquals("Job", "1", "state", "IN_PROGRESS");
  assert.fieldEquals("Job", "1", "openDisputeCount", "0");
  clearStore();
});

test("records completed and cancelled job terminal timestamps", () => {
  seedJob(2);
  handleJobCompleted(jobCompleted());
  assert.fieldEquals("Job", "1", "state", "COMPLETED");
  assert.fieldEquals("Job", "1", "completedAt", "300");
  assert.fieldEquals("Job", "1", "approvedMilestoneCount", "2");
  clearStore();

  seedJob(1);
  handleJobCancelled(jobCancelled());
  assert.fieldEquals("Job", "1", "state", "CANCELLED");
  assert.fieldEquals("Job", "1", "cancelledAt", "301");
  clearStore();
});
