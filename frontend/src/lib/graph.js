// The Graph reads. Set VITE_SUBGRAPH_URL to a deployed Subgraph Studio endpoint;
// leave it unset and the app falls back to reading the chain directly (see
// useEscrow.js). The fallback is a supported mode, not dead code — it's what makes
// the app work against a fresh deployment before the subgraph has synced.
const SUBGRAPH_URL = import.meta.env.VITE_SUBGRAPH_URL;

/** True when a subgraph endpoint is configured. */
export const hasSubgraph = () => Boolean(SUBGRAPH_URL);

async function gql(query, variables) {
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Subgraph HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

// The subgraph stores states as readable strings ("FUNDED", "IN_PROGRESS", …) while
// the pages consume the design's `accepted` / `cancelled` / `total` shape — the same
// contract given by useEscrow's adaptJob, so both read paths are interchangeable.
const JOB_FIELDS = `
  id
  jobId
  client
  freelancer
  arbitrator
  token
  totalAmount
  milestoneCount
  timelock
  state
  createdAt
`;

function adaptGraphJob(j) {
  if (!j) return null;
  const state = j.state;
  return {
    id: Number(j.jobId),
    client: j.client,
    freelancer: j.freelancer,
    arbitrator: j.arbitrator,
    token: j.token,
    total: BigInt(j.totalAmount),
    timelock: BigInt(j.timelock),
    createdAt: BigInt(j.createdAt),
    accepted: state === 'IN_PROGRESS' || state === 'COMPLETED' || state === 'DISPUTED',
    cancelled: state === 'CANCELLED',
    milestoneCount: Number(j.milestoneCount),
    state,
  };
}

/** Jobs where `address` is the client, the freelancer, or the arbitrator — newest first. */
export async function fetchJobsFor(address) {
  const data = await gql(
    `query JobsFor($who: Bytes!) {
      asClient: jobs(where: { client: $who }, orderBy: createdAt, orderDirection: desc, first: 100) { ${JOB_FIELDS} }
      asFreelancer: jobs(where: { freelancer: $who }, orderBy: createdAt, orderDirection: desc, first: 100) { ${JOB_FIELDS} }
      asArbitrator: jobs(where: { arbitrator: $who }, orderBy: createdAt, orderDirection: desc, first: 100) { ${JOB_FIELDS} }
    }`,
    { who: address.toLowerCase() },
  );
  const byId = new Map();
  for (const j of [...(data.asClient || []), ...(data.asFreelancer || []), ...(data.asArbitrator || [])]) {
    byId.set(j.id, adaptGraphJob(j));
  }
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

/** The activity feed for one job, oldest first — the timeline/journal source. */
export async function fetchActivities(jobId) {
  const data = await gql(
    `query Activities($job: String!) {
      activities(where: { job: $job }, orderBy: timestamp, orderDirection: asc, first: 200) {
        id
        type
        milestoneIndex
        actor
        timestamp
        txHash
        data
      }
    }`,
    { job: String(jobId) },
  );
  return (data.activities || []).map((a) => ({
    id: a.id,
    type: a.type,
    milestoneIndex: a.milestoneIndex == null ? null : Number(a.milestoneIndex),
    actor: a.actor,
    timestamp: Number(a.timestamp),
    txHash: a.txHash,
    data: a.data,
  }));
}

/** Disputes on a job, including each side's evidence CID. */
export async function fetchDisputes(jobId) {
  const data = await gql(
    `query Disputes($job: String!) {
      disputes(where: { job: $job }, orderBy: timestamp, orderDirection: asc, first: 100) {
        id
        milestoneIndex
        raisedBy
        evidenceCid
        resolved
        freelancerBps
        freelancerAmount
        clientAmount
        timestamp
      }
    }`,
    { job: String(jobId) },
  );
  return (data.disputes || []).map((d) => ({
    id: d.id,
    milestoneIndex: Number(d.milestoneIndex),
    raisedBy: d.raisedBy,
    evidenceCid: d.evidenceCid,
    resolved: d.resolved,
    freelancerBps: d.freelancerBps,
    freelancerAmount: d.freelancerAmount == null ? null : BigInt(d.freelancerAmount),
    clientAmount: d.clientAmount == null ? null : BigInt(d.clientAmount),
    timestamp: Number(d.timestamp),
  }));
}
