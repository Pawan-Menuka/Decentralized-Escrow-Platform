import type { Activity } from '../domain/escrow';
import { EXPLORER } from '../config/wagmi';
import { ipfsUrls } from '../lib/ipfs';
import { T, short } from '../theme';

export function EvidenceLinks({ activity }: { activity: Activity }) {
  if (!activity.data) return null;
  const [primary, backup] = ipfsUrls(activity.data);
  return <span>
    <a href={primary} target="_blank" rel="noopener noreferrer">Open evidence ↗</a>{' · '}
    <a href={backup} target="_blank" rel="noopener noreferrer">Backup gateway ↗</a>
  </span>;
}

export default function JobActivity({ activities, isLoading, unavailable, onRefresh }: {
  activities: Activity[];
  isLoading: boolean;
  unavailable?: string;
  onRefresh: () => void;
}) {
  return <section aria-label="Job activity" style={{ borderTop: `1px solid ${T.line}`, padding: '20px 24px', fontSize: 12 }}>
    <h2 style={{ fontSize: 15 }}>Activity</h2>
    {isLoading ? <p role="status">Loading job history…</p> : unavailable ? <p role="status">Activity and dispute evidence are unavailable: {unavailable} Contract state remains available above.</p> : activities.length === 0 ? <p>No indexed activity yet.</p> : <ol style={{ paddingLeft: 20 }}>
      {activities.map((activity) => <li key={activity.id} style={{ marginBottom: 14 }}>
        <div>{activity.type.toLowerCase().replaceAll('_', ' ')}{activity.milestoneIndex !== null && ` · Milestone ${activity.milestoneIndex + 1}`}</div>
        <div style={{ color: T.sub, marginTop: 4 }}><time dateTime={new Date(activity.timestamp * 1000).toISOString()}>{new Date(activity.timestamp * 1000).toLocaleString()}</time>{activity.actor && <> · <a href={`${EXPLORER}/address/${activity.actor}`} target="_blank" rel="noopener noreferrer">{short(activity.actor)}</a></>} · <a href={`${EXPLORER}/tx/${activity.txHash}`} target="_blank" rel="noopener noreferrer">Transaction ↗</a></div>
        {activity.type === 'DISPUTE_RAISED' && <EvidenceLinks activity={activity} />}
        {activity.type === 'MILESTONE_REJECTED' && activity.data && <p>Requested changes: {activity.data}</p>}
      </li>)}
    </ol>}
    <button type="button" onClick={onRefresh}>Refresh activity</button>
  </section>;
}
