import { T, mono, STATE_COLOR } from '../theme';
import { fmtAmount } from '../lib/format';

// "Where the money is" — one segment per milestone, colored by state.
export default function MoneyBar({ milestones, token, legendLabels }) {
  const total = milestones.reduce((a, m) => a + m.amount, 0n);
  if (total === 0n) return null;
  return (
    <div>
      <div style={{ display: 'flex', height: 8, border: `1px solid ${T.line}` }}>
        {milestones.map((m) => (
          <div key={m.index} style={{ width: `${Number((m.amount * 10000n) / total) / 100}%`, background: STATE_COLOR[m.state], borderRight: `1px solid ${T.bg}` }} />
        ))}
      </div>
      {legendLabels && (
        <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
          {milestones.map((m) => (
            <div key={m.index} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: T.sub }}>
              <span style={{ width: 8, height: 8, background: STATE_COLOR[m.state], display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontFamily: mono, color: T.body, minWidth: 80, display: 'inline-block' }}>{fmtAmount(m.amount, token)}</span>
              <span style={{ color: T.mut }}>{legendLabels[m.state]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
