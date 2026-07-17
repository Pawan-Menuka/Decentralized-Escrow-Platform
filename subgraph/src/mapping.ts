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
    job.timelock = BigInt.zero();
    job.state = "NONE";
    job.createdAt = BigInt.zero();
  }
  return job as Job;
}

export function handleJobCreated(event: JobCreated): void {
  let jobId = event.params.jobId;
  let job = loadJob(jobId);
  job.client = event.params.client;
  job.freelancer = event.params.freelancer;
  job.token = event.params.token;
  job.totalAmount = event.params.totalAmount;
  job.milestoneCount = event.params.milestoneCount;
  job.timelock = event.params.timelock;
  job.state = "FUNDED";
  job.createdAt = event.block.timestamp;

  let contract = FreelanceEscrowContract.bind(event.address);

  // The per-job arbitrator isn't in JobCreated — read the snapshot off the contract
  // so the arbitrator desk can query by it.
  let jobResult = contract.try_getJob(jobId);
  job.arbitrator = jobResult.reverted ? Bytes.empty() : jobResult.value.arbitrator;
  job.save();

  // Milestone amounts are not carried in the event either — pull each milestone's
  // amount via the generated view-function bindings.
  let count = event.params.milestoneCount.toI32();
  let milestonesResult = contract.try_getMilestones(jobId);
  if (!milestonesResult.reverted) {
    let ms = milestonesResult.value;
    for (let i = 0; i < ms.length; i++) {
      let idx = BigInt.fromI32(i);
      let milestone = new Milestone(milestoneId(jobId, idx));
      milestone.job = job.id;
      milestone.index = idx;
      milestone.amount = ms[i].amount;
      milestone.state = "PENDING";
      milestone.deliverableCid = null;
      milestone.submittedAt = null;
      milestone.fee = null;
      milestone.save();
    }
  } else {
    // Fallback: create placeholder milestones with zero amount if the call reverts
    // (should not happen against a live contract, but keeps indexing resilient).
    for (let i = 0; i < count; i++) {
      let idx = BigInt.fromI32(i);
      let milestone = new Milestone(milestoneId(jobId, idx));
      milestone.job = job.id;
      milestone.index = idx;
      milestone.amount = BigInt.zero();
      milestone.state = "PENDING";
      milestone.deliverableCid = null;
      milestone.submittedAt = null;
      milestone.fee = null;
      milestone.save();
    }
  }

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
  let job = loadJob(jobId);
  job.usdTotal = event.params.usdTotal;
  job.ethUsdPrice = event.params.ethUsdPrice;
  job.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = job.id;
  activity.type = "JOB_CREATED_USD";
  activity.milestoneIndex = null;
  activity.actor = null;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = event.params.usdTotal.toString();
  activity.save();
}

export function handleJobAccepted(event: JobAccepted): void {
  let jobId = event.params.jobId;
  let job = loadJob(jobId);
  job.state = "IN_PROGRESS";
  job.freelancer = event.params.freelancer;
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
  let job = loadJob(jobId);
  job.state = "CANCELLED";
  job.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = job.id;
  activity.type = "JOB_CANCELLED";
  activity.milestoneIndex = null;
  activity.actor = null;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = null;
  activity.save();
}

export function handleJobCompleted(event: JobCompleted): void {
  let jobId = event.params.jobId;
  let job = loadJob(jobId);
  job.state = "COMPLETED";
  job.completedAt = event.block.timestamp;
  job.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = job.id;
  activity.type = "JOB_COMPLETED";
  activity.milestoneIndex = null;
  activity.actor = null;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = null;
  activity.save();
}

export function handleMilestoneSubmitted(event: MilestoneSubmitted): void {
  let jobId = event.params.jobId;
  let mIndex = event.params.mIndex;
  let milestone = Milestone.load(milestoneId(jobId, mIndex));
  if (milestone == null) {
    milestone = new Milestone(milestoneId(jobId, mIndex));
    milestone.job = jobId.toString();
    milestone.index = mIndex;
    milestone.amount = BigInt.zero();
    milestone.fee = null;
  }
  milestone.state = "SUBMITTED";
  milestone.deliverableCid = event.params.deliverableCid;
  milestone.submittedAt = event.block.timestamp;
  milestone.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = jobId.toString();
  activity.type = "MILESTONE_SUBMITTED";
  activity.milestoneIndex = mIndex;
  activity.actor = null;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = event.params.deliverableCid;
  activity.save();
}

export function handleMilestoneApproved(event: MilestoneApproved): void {
  let jobId = event.params.jobId;
  let mIndex = event.params.mIndex;
  let milestone = Milestone.load(milestoneId(jobId, mIndex));
  if (milestone == null) {
    milestone = new Milestone(milestoneId(jobId, mIndex));
    milestone.job = jobId.toString();
    milestone.index = mIndex;
    milestone.amount = event.params.amount;
    milestone.deliverableCid = null;
    milestone.submittedAt = null;
  }
  milestone.state = "APPROVED";
  milestone.fee = event.params.fee;
  milestone.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = jobId.toString();
  activity.type = "MILESTONE_APPROVED";
  activity.milestoneIndex = mIndex;
  activity.actor = null;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = event.params.amount.toString();
  activity.save();
}

export function handleMilestoneRejected(event: MilestoneRejected): void {
  let jobId = event.params.jobId;
  let mIndex = event.params.mIndex;
  let milestone = Milestone.load(milestoneId(jobId, mIndex));
  if (milestone == null) {
    milestone = new Milestone(milestoneId(jobId, mIndex));
    milestone.job = jobId.toString();
    milestone.index = mIndex;
    milestone.amount = BigInt.zero();
    milestone.deliverableCid = null;
    milestone.submittedAt = null;
    milestone.fee = null;
  }
  milestone.state = "PENDING";
  milestone.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = jobId.toString();
  activity.type = "MILESTONE_REJECTED";
  activity.milestoneIndex = mIndex;
  activity.actor = null;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = event.params.reason;
  activity.save();
}

export function handleMilestoneAutoReleased(event: MilestoneAutoReleased): void {
  let jobId = event.params.jobId;
  let mIndex = event.params.mIndex;
  let milestone = Milestone.load(milestoneId(jobId, mIndex));
  if (milestone == null) {
    milestone = new Milestone(milestoneId(jobId, mIndex));
    milestone.job = jobId.toString();
    milestone.index = mIndex;
    milestone.amount = event.params.amount;
    milestone.deliverableCid = null;
    milestone.submittedAt = null;
  }
  milestone.state = "AUTO_RELEASED";
  milestone.fee = event.params.fee;
  milestone.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = jobId.toString();
  activity.type = "MILESTONE_AUTO_RELEASED";
  activity.milestoneIndex = mIndex;
  activity.actor = null;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = event.params.amount.toString();
  activity.save();
}

export function handleDisputeRaised(event: DisputeRaised): void {
  let jobId = event.params.jobId;
  let mIndex = event.params.mIndex;

  let job = loadJob(jobId);
  job.state = "DISPUTED";
  job.save();

  let milestone = Milestone.load(milestoneId(jobId, mIndex));
  if (milestone == null) {
    milestone = new Milestone(milestoneId(jobId, mIndex));
    milestone.job = jobId.toString();
    milestone.index = mIndex;
    milestone.amount = BigInt.zero();
    milestone.deliverableCid = null;
    milestone.submittedAt = null;
    milestone.fee = null;
  }
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

  let milestone = Milestone.load(milestoneId(jobId, mIndex));
  if (milestone == null) {
    milestone = new Milestone(milestoneId(jobId, mIndex));
    milestone.job = jobId.toString();
    milestone.index = mIndex;
    milestone.amount = BigInt.zero();
    milestone.deliverableCid = null;
    milestone.submittedAt = null;
  }
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
  dispute.save();

  // Job returns to IN_PROGRESS, or COMPLETED if this was the last outstanding milestone.
  // The contract itself decides which via a subsequent JobCompleted event when applicable;
  // here we optimistically move it back to IN_PROGRESS and let JobCompleted override it.
  let job = loadJob(jobId);
  if (job.state == "DISPUTED") {
    job.state = "IN_PROGRESS";
  }
  job.save();

  let activity = new Activity(activityId(event.transaction.hash, event.logIndex));
  activity.job = jobId.toString();
  activity.type = "DISPUTE_RESOLVED";
  activity.milestoneIndex = mIndex;
  activity.actor = null;
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
  activity.actor = null;
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
  activity.actor = null;
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
  activity.actor = event.params.newArbitrator;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.data = null;
  activity.save();
}
