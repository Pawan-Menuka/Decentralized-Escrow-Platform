import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { newMockEvent } from "matchstick-as/assembly/index";
import {
  DisputeRaised,
  DisputeResolved,
  JobCancelled,
  JobCompleted,
  JobCreated,
  JobCreatedUsd,
  MilestoneApproved,
  MilestoneAutoReleased,
  MilestoneRejected,
  MilestoneSubmitted,
} from "../generated/FreelanceEscrow/FreelanceEscrow";

function configure(event: ethereum.Event, sender: Address, timestamp: i32): void {
  event.address = Address.fromString("0x00000000000000000000000000000000000000aa");
  event.transaction.from = sender;
  event.block.timestamp = BigInt.fromI32(timestamp);
}

export function jobCreated(
  client: Address,
  freelancer: Address,
  token: Address,
  total: i32,
  count: i32,
): JobCreated {
  let event = changetype<JobCreated>(newMockEvent());
  configure(event, client, 100);
  event.parameters = new Array<ethereum.EventParam>();
  event.parameters.push(new ethereum.EventParam("jobId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))));
  event.parameters.push(new ethereum.EventParam("client", ethereum.Value.fromAddress(client)));
  event.parameters.push(new ethereum.EventParam("freelancer", ethereum.Value.fromAddress(freelancer)));
  event.parameters.push(new ethereum.EventParam("token", ethereum.Value.fromAddress(token)));
  event.parameters.push(new ethereum.EventParam("totalAmount", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(total))));
  event.parameters.push(new ethereum.EventParam("milestoneCount", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(count))));
  event.parameters.push(new ethereum.EventParam("timelock", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(3600))));
  return event;
}

export function jobCreatedUsd(): JobCreatedUsd {
  let event = changetype<JobCreatedUsd>(newMockEvent());
  configure(event, Address.fromString("0x0000000000000000000000000000000000000001"), 101);
  event.parameters = [
    new ethereum.EventParam("jobId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    new ethereum.EventParam("usdTotal", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(50000))),
    new ethereum.EventParam("ethUsdPrice", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(2500))),
  ];
  return event;
}

export function milestoneSubmitted(index: i32, cid: string, timestamp: i32 = 200): MilestoneSubmitted {
  let event = changetype<MilestoneSubmitted>(newMockEvent());
  configure(event, Address.fromString("0x0000000000000000000000000000000000000002"), timestamp);
  event.parameters = [
    new ethereum.EventParam("jobId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    new ethereum.EventParam("mIndex", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(index))),
    new ethereum.EventParam("deliverableCid", ethereum.Value.fromString(cid)),
  ];
  return event;
}

export function milestoneRejected(index: i32): MilestoneRejected {
  let event = changetype<MilestoneRejected>(newMockEvent());
  configure(event, Address.fromString("0x0000000000000000000000000000000000000001"), 201);
  event.parameters = [
    new ethereum.EventParam("jobId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    new ethereum.EventParam("mIndex", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(index))),
    new ethereum.EventParam("reason", ethereum.Value.fromString("revise")),
  ];
  return event;
}

export function milestoneApproved(index: i32, amount: i32): MilestoneApproved {
  let event = changetype<MilestoneApproved>(newMockEvent());
  configure(event, Address.fromString("0x0000000000000000000000000000000000000001"), 210);
  event.parameters = [
    new ethereum.EventParam("jobId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    new ethereum.EventParam("mIndex", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(index))),
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(amount))),
    new ethereum.EventParam("fee", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(5))),
  ];
  return event;
}

export function milestoneAutoReleased(index: i32, amount: i32): MilestoneAutoReleased {
  let event = changetype<MilestoneAutoReleased>(newMockEvent());
  configure(event, Address.fromString("0x0000000000000000000000000000000000000003"), 220);
  event.parameters = [
    new ethereum.EventParam("jobId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    new ethereum.EventParam("mIndex", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(index))),
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(amount))),
    new ethereum.EventParam("fee", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(5))),
  ];
  return event;
}

export function disputeRaised(index: i32): DisputeRaised {
  let sender = Address.fromString("0x0000000000000000000000000000000000000002");
  let event = changetype<DisputeRaised>(newMockEvent());
  configure(event, sender, 230 + index);
  event.parameters = [
    new ethereum.EventParam("jobId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    new ethereum.EventParam("mIndex", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(index))),
    new ethereum.EventParam("raisedBy", ethereum.Value.fromAddress(sender)),
    new ethereum.EventParam("evidenceCid", ethereum.Value.fromString("bafy-evidence")),
  ];
  return event;
}

export function disputeResolved(index: i32): DisputeResolved {
  let event = changetype<DisputeResolved>(newMockEvent());
  configure(event, Address.fromString("0x0000000000000000000000000000000000000003"), 240 + index);
  event.parameters = [
    new ethereum.EventParam("jobId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    new ethereum.EventParam("mIndex", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(index))),
    new ethereum.EventParam("freelancerBps", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(6000))),
    new ethereum.EventParam("freelancerAmount", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(57))),
    new ethereum.EventParam("clientAmount", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(40))),
    new ethereum.EventParam("fee", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(3))),
  ];
  return event;
}

export function jobCompleted(): JobCompleted {
  let event = changetype<JobCompleted>(newMockEvent());
  configure(event, Address.fromString("0x0000000000000000000000000000000000000001"), 300);
  event.parameters = [new ethereum.EventParam("jobId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1)))];
  return event;
}

export function jobCancelled(): JobCancelled {
  let event = changetype<JobCancelled>(newMockEvent());
  configure(event, Address.fromString("0x0000000000000000000000000000000000000001"), 301);
  event.parameters = [new ethereum.EventParam("jobId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1)))];
  return event;
}
