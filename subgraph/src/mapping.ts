import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  FreelanceEscrow as FreelanceEscrowContract,
  JobCreated,
  JobCreatedUsd,
  JobAccepted,
  JobCancelled,
  JobCompleted,
  MilestoneSubmitted,
  MilestoneApproved,
  MilestoneRejected,
  MilestoneAutoReleased,
  DisputeRaised,
  DisputeResolved,
  Withdrawal as WithdrawalEvent,
  FeeUpdated,
  FeesWithdrawn,
  ArbitratorUpdated,
} from "../generated/FreelanceEscrow/FreelanceEscrow";
import { Job, Milestone, Activity, Withdrawal, Dispute } from "../generated/schema";

function milestoneId(jobId: BigInt, mIndex: BigInt): string {
  return jobId.toString() + "-" + mIndex.toString();
}

function activityId(txHash: Bytes, logIndex: BigInt): string {
  return txHash.toHex() + "-" + logIndex.toString();
}

function loadJob(jobId: BigInt): Job {
  let job = Job.load(jobId.toString());
  if (job == null) {
    job = new Job(jobId.toString());
    job.jobId = jobId;
    job.client = Bytes.empty();
    job.freelancer = Bytes.empty();
    job.arbitrator = Bytes.empty();
    job.token = Bytes.empty();
    job.totalAmount = BigInt.zero();
    job.milestoneCount = BigInt.zero();
    job.approvedMilestoneCount = BigInt.zero();
    job.openDisputeCount = BigInt.zero();
    job.timelock = BigInt.zero();
    job.state = "NONE";
    job.createdAt = BigInt.zero();
    job.updatedAt = BigInt.zero();
    job.arbitratorVerified = false;
    job.milestonesHydrated = false;
  }
  return job as Job;
}

function loadMilestone(jobId: BigInt, mIndex: BigInt): Milestone {
  let id = milestoneId(jobId, mIndex);
  let milestone = Milestone.load(id);
  if (milestone == null) {
    milestone = new Milestone(id);
    milestone.job = jobId.toString();
    milestone.index = mIndex;
    milestone.amount = BigInt.zero();
    milestone.amountVerified = false;
    milestone.state = "PENDING";
    milestone.deliverableCid = null;
    milestone.submittedAt = null;
    milestone.fee = null;
  }
  return milestone as Milestone;
}

function touchJob(jobId: BigInt, timestamp: BigInt): Job {
  let job = loadJob(jobId);
  job.updatedAt = timestamp;
  return job;
}

export function handleJobCreated(event: JobCreated): void {
  let jobId = event.params.jobId;
  let job = loadJob(jobId);
  job.client = event.params.client;
  job.freelancer = event.params.freelancer;
  job.token = event.params.token;
  job.totalAmount = event.params.totalAmount;
  job.milestoneCount = event.params.milestoneCount;
  job.approvedMilestoneCount = BigInt.zero();
  job.openDisputeCount = BigInt.zero();
  job.timelock = event.params.timelock;
  job.state = "FUNDED";
  job.createdAt = event.block.timestamp;
  job.updatedAt = event.block.timestamp;

  let contract = FreelanceEscrowContract.bind(event.address);

  // The per-job arbitrator isn't in JobCreated — read the snapshot off the contract
  // so the arbitrator desk can query by it.
  let jobResult = contract.try_getJob(jobId);
  if (jobResult.reverted) {
    job.arbitrator = Bytes.empty();
    job.arbitratorVerified = false;
  } else {
    job.arbitrator = jobResult.value.arbitrator;
    job.approvedMilestoneCount = BigInt.fromI32(jobResult.value.approvedCount);
    job.arbitratorVerified = true;
  }

  // Milestone amounts are not carried in the event either — pull each milestone's
  // amount via the generated view-function bindings.
  let count = event.params.milestoneCount.toI32();
  let milestonesResult = contract.try_getMilestones(jobId);
  if (!milestonesResult.reverted) {
    let ms = milestonesResult.value;
    for (let i = 0; i < ms.length; i++) {
      let idx = BigInt.fromI32(i);
      let milestone = loadMilestone(jobId, idx);
      milestone.amount = ms[i].amount;
      milestone.amountVerified = true;
      milestone.state = "PENDING";
      milestone.deliverableCid = null;
      milestone.submittedAt = null;
      milestone.fee = null;
      milestone.save();
    }
    job.milestonesHydrated = true;
  } else {
    // Preserve the entities so later events can still be indexed, but explicitly mark
    // zero amounts as unverified. Consumers must fall back to RPC for these values.
    for (let i = 0; i < count; i++) {
      let idx = BigInt.fromI32(i);
      let milestone = loadMilestone(jobId, idx);
      milestone.save();
    }
    job.milestonesHydrated = false;
  }
  job.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = job.id;
  activity.type = "JOB_CREATED";
  activity.milestoneIndex = null;
  activity.actor = event.params.client;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = event.params.totalAmount.toString();
  activity.save();
}

export function handleJobCreatedUsd(event: JobCreatedUsd): void {
  let jobId = event.params.jobId;
  let job = touchJob(jobId, event.block.timestamp);
  job.usdTotal = event.params.usdTotal;
  job.ethUsdPrice = event.params.ethUsdPrice;
  job.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = job.id;
  activity.type = "JOB_CREATED_USD";
  activity.milestoneIndex = null;
  activity.actor = event.transaction.from;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = event.params.usdTotal.toString();
  activity.save();
}

export function handleJobAccepted(event: JobAccepted): void {
  let jobId = event.params.jobId;
  let job = touchJob(jobId, event.block.timestamp);
  job.state = "IN_PROGRESS";
  job.freelancer = event.params.freelancer;
  job.acceptedAt = event.block.timestamp;
  job.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = job.id;
  activity.type = "JOB_ACCEPTED";
  activity.milestoneIndex = null;
  activity.actor = event.params.freelancer;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = null;
  activity.save();
}

export function handleJobCancelled(event: JobCancelled): void {
  let jobId = event.params.jobId;
  let job = touchJob(jobId, event.block.timestamp);
  job.state = "CANCELLED";
  job.cancelledAt = event.block.timestamp;
  job.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = job.id;
  activity.type = "JOB_CANCELLED";
  activity.milestoneIndex = null;
  activity.actor = event.transaction.from;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = null;
  activity.save();
}

export function handleJobCompleted(event: JobCompleted): void {
  let jobId = event.params.jobId;
  let job = touchJob(jobId, event.block.timestamp);
  job.state = "COMPLETED";
  job.approvedMilestoneCount = job.milestoneCount;
  job.completedAt = event.block.timestamp;
  job.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = job.id;
  activity.type = "JOB_COMPLETED";
  activity.milestoneIndex = null;
  activity.actor = event.transaction.from;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = null;
  activity.save();
}

export function handleMilestoneSubmitted(event: MilestoneSubmitted): void {
  let jobId = event.params.jobId;
  let mIndex = event.params.mIndex;
  let milestone = loadMilestone(jobId, mIndex);
  milestone.state = "SUBMITTED";
  milestone.deliverableCid = event.params.deliverableCid;
  milestone.submittedAt = event.block.timestamp;
  milestone.save();

  let job = touchJob(jobId, event.block.timestamp);
  job.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = jobId.toString();
  activity.type = "MILESTONE_SUBMITTED";
  activity.milestoneIndex = mIndex;
  activity.actor = event.transaction.from;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = event.params.deliverableCid;
  activity.save();
}

export function handleMilestoneApproved(event: MilestoneApproved): void {
  let jobId = event.params.jobId;
  let mIndex = event.params.mIndex;
  let milestone = loadMilestone(jobId, mIndex);
  milestone.amount = event.params.amount;
  milestone.amountVerified = true;
  milestone.state = "APPROVED";
  milestone.fee = event.params.fee;
  milestone.save();

  let job = touchJob(jobId, event.block.timestamp);
  job.approvedMilestoneCount = job.approvedMilestoneCount.plus(BigInt.fromI32(1));
  job.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = jobId.toString();
  activity.type = "MILESTONE_APPROVED";
  activity.milestoneIndex = mIndex;
  activity.actor = event.transaction.from;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = event.params.amount.toString();
  activity.save();
}

export function handleMilestoneRejected(event: MilestoneRejected): void {
  let jobId = event.params.jobId;
  let mIndex = event.params.mIndex;
  let milestone = loadMilestone(jobId, mIndex);
  milestone.state = "PENDING";
  milestone.deliverableCid = null;
  milestone.submittedAt = null;
  milestone.save();

  let job = touchJob(jobId, event.block.timestamp);
  job.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = jobId.toString();
  activity.type = "MILESTONE_REJECTED";
  activity.milestoneIndex = mIndex;
  activity.actor = event.transaction.from;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = event.params.reason;
  activity.save();
}

export function handleMilestoneAutoReleased(event: MilestoneAutoReleased): void {
  let jobId = event.params.jobId;
  let mIndex = event.params.mIndex;
  let milestone = loadMilestone(jobId, mIndex);
  milestone.amount = event.params.amount;
  milestone.amountVerified = true;
  milestone.state = "AUTO_RELEASED";
  milestone.fee = event.params.fee;
  milestone.save();

  let job = touchJob(jobId, event.block.timestamp);
  job.approvedMilestoneCount = job.approvedMilestoneCount.plus(BigInt.fromI32(1));
  job.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = jobId.toString();
  activity.type = "MILESTONE_AUTO_RELEASED";
  activity.milestoneIndex = mIndex;
  activity.actor = event.transaction.from;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = event.params.amount.toString();
  activity.save();
}

export function handleDisputeRaised(event: DisputeRaised): void {
  let jobId = event.params.jobId;
  let mIndex = event.params.mIndex;

  let job = touchJob(jobId, event.block.timestamp);
  job.state = "DISPUTED";
  job.openDisputeCount = job.openDisputeCount.plus(BigInt.fromI32(1));
  job.save();

  let milestone = loadMilestone(jobId, mIndex);
  milestone.state = "DISPUTED";
  milestone.save();

  let dispute = new Dispute(milestoneId(jobId, mIndex));
  dispute.job = jobId.toString();
  dispute.milestoneIndex = mIndex;
  dispute.raisedBy = event.params.raisedBy;
  dispute.evidenceCid = event.params.evidenceCid;
  dispute.resolved = false;
  dispute.freelancerAmount = null;
  dispute.clientAmount = null;
  dispute.timestamp = event.block.timestamp;
  dispute.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = jobId.toString();
  activity.type = "DISPUTE_RAISED";
  activity.milestoneIndex = mIndex;
  activity.actor = event.params.raisedBy;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = event.params.evidenceCid;
  activity.save();
}

export function handleDisputeResolved(event: DisputeResolved): void {
  let jobId = event.params.jobId;
  let mIndex = event.params.mIndex;

  let milestone = loadMilestone(jobId, mIndex);
  milestone.amount = event.params.freelancerAmount
    .plus(event.params.clientAmount)
    .plus(event.params.fee);
  milestone.amountVerified = true;
  milestone.state = "RESOLVED";
  milestone.fee = event.params.fee;
  milestone.resolvedFreelancerBps = event.params.freelancerBps;
  milestone.save();

  let dispute = Dispute.load(milestoneId(jobId, mIndex));
  if (dispute == null) {
    dispute = new Dispute(milestoneId(jobId, mIndex));
    dispute.job = jobId.toString();
    dispute.milestoneIndex = mIndex;
    dispute.raisedBy = Bytes.empty();
    dispute.evidenceCid = null;
    dispute.timestamp = event.block.timestamp;
  }
  dispute.resolved = true;
  dispute.freelancerBps = event.params.freelancerBps;
  dispute.freelancerAmount = event.params.freelancerAmount;
  dispute.clientAmount = event.params.clientAmount;
  dispute.resolvedAt = event.block.timestamp;
  dispute.save();

  // A job stays disputed until every concurrently open dispute has been resolved.
  // If this resolution completes the job, the subsequent JobCompleted event overrides
  // IN_PROGRESS in the same transaction.
  let job = touchJob(jobId, event.block.timestamp);
  if (job.openDisputeCount.gt(BigInt.zero())) {
    job.openDisputeCount = job.openDisputeCount.minus(BigInt.fromI32(1));
  }
  job.approvedMilestoneCount = job.approvedMilestoneCount.plus(BigInt.fromI32(1));
  if (job.openDisputeCount.equals(BigInt.zero()) && job.state == "DISPUTED") {
    job.state = "IN_PROGRESS";
  }
  job.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = jobId.toString();
  activity.type = "DISPUTE_RESOLVED";
  activity.milestoneIndex = mIndex;
  activity.actor = event.transaction.from;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = event.params.freelancerAmount.toString();
  activity.save();
}

export function handleWithdrawal(event: WithdrawalEvent): void {
  let withdrawal = new Withdrawal(activityId(event.transaction.hash, event.logIndex));
  withdrawal.account = event.params.account;
  withdrawal.token = event.params.token;
  withdrawal.amount = event.params.amount;
  withdrawal.timestamp = event.block.timestamp;
  withdrawal.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = null;
  activity.type = "WITHDRAWAL";
  activity.milestoneIndex = null;
  activity.actor = event.params.account;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = event.params.amount.toString();
  activity.save();
}

export function handleFeeUpdated(event: FeeUpdated): void {
  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = null;
  activity.type = "FEE_UPDATED";
  activity.milestoneIndex = null;
  activity.actor = event.transaction.from;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data =
    event.params.oldBps.toString() + "->" + event.params.newBps.toString();
  activity.save();
}

export function handleFeesWithdrawn(event: FeesWithdrawn): void {
  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = null;
  activity.type = "FEES_WITHDRAWN";
  activity.milestoneIndex = null;
  activity.actor = event.transaction.from;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = event.params.amount.toString();
  activity.save();
}

export function handleArbitratorUpdated(event: ArbitratorUpdated): void {
  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = null;
  activity.type = "ARBITRATOR_UPDATED";
  activity.milestoneIndex = null;
  activity.actor = event.transaction.from;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = event.params.newArbitrator.toHexString();
  activity.save();
}
