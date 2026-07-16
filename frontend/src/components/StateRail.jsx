import { T, mono, STATE_COLOR } from '../theme';

// The milestone state-machine rail: PENDING → SUBMITTED → APPROVED,
// with the auto-release branch forking up and the dispute branch dropping down.
// `countdownText` renders on the auto-release wire while SUBMITTED.
const C = { P: T.sub, S: T.amber, A: T.green, AR: T.auto, D: T.red, R: T.violet };
const NODES_ON = {
  PENDING: ['P'], SUBMITTED: ['P', 'S'], APPROVED: ['P', 'S', 'A'],
  DISPUTED: ['P', 'S', 'D'], RESOLVED: ['P', 'S', 'D', 'R'], AUTO_RELEASED: ['P', 'S', 'AR'], CANCELLED: [],
};
const EDGES_ON = {
  PENDING: [], SUBMITTED: ['e1'], APPROVED: ['e1', 'e2'],
  DISPUTED: ['e1', 'e4'], RESOLVED: ['e1', 'e4', 'e5'], AUTO_RELEASED: ['e1', 'e3'], CANCELLED: [],
};
const EDGE_COLOR = { e1: C.S, e2: C.A, e3: C.AR, e4: C.D, e5: C.R };
const COORDS = { e1: [30, 30, 190, 30], e2: [190, 30, 350, 30], e3: [190, 30, 330, 8], e4: [190, 30, 250, 62], e5: [250, 62, 390, 62] };
const RECENT = { SUBMITTED: 'e1', APPROVED: 'e2', DISPUTED: 'e4', RESOLVED: 'e5', AUTO_RELEASED: 'e3' };

export default function StateRail({ state, countdownText, countdownColor }) {
  const on = NODES_ON[state] || [];
  const eOn = EDGES_ON[state] || [];
  const recent = RECENT[state];
  const edge = (k) => ({ stroke: eOn.includes(k) ? EDGE_COLOR[k] : T.line, strokeDasharray: eOn.includes(k) ? '0' : '3 4' });
  const node = (k) => ({ fill: on.includes(k) ? C[k] : T.bg, stroke: on.includes(k) ? C[k] : T.dim });
  const lbl = (k) => (on.includes(k) ? C[k] : T.cancel);
  const txt = { fontFamily: mono, fontSize: '8.5px', letterSpacing: '0.5px' };
  return (
    <svg width="460" height="84" viewBox="0 0 460 84" style={{ display: 'block' }}>
      <line x1="30" y1="30" x2="190" y2="30" strokeWidth="1.5" {...edge('e1')} />
      <line x1="190" y1="30" x2="350" y2="30" strokeWidth="1.5" {...edge('e2')} />
      <line x1="190" y1="30" x2="330" y2="8" strokeWidth="1.5" {...edge('e3')} />
      <line x1="190" y1="30" x2="250" y2="62" strokeWidth="1.5" {...edge('e4')} />
      <line x1="250" y1="62" x2="390" y2="62" strokeWidth="1.5" {...edge('e5')} />
      {recent && (
        <line x1={COORDS[recent][0]} y1={COORDS[recent][1]} x2={COORDS[recent][2]} y2={COORDS[recent][3]}
          stroke={EDGE_COLOR[recent]} strokeWidth="2.5" strokeDasharray="7 5" style={{ animation: 'ledgerdash 1.1s linear infinite' }} />
      )}
      <circle cx="30" cy="30" r="4.5" strokeWidth="1.5" {...node('P')} />
      <circle cx="190" cy="30" r="4.5" strokeWidth="1.5" {...node('S')} />
      <circle cx="350" cy="30" r="4.5" strokeWidth="1.5" {...node('A')} />
      <circle cx="330" cy="8" r="3.5" strokeWidth="1.5" {...node('AR')} />
      <circle cx="250" cy="62" r="3.5" strokeWidth="1.5" {...node('D')} />
      <circle cx="390" cy="62" r="3.5" strokeWidth="1.5" {...node('R')} />
      <text x="30" y="47" textAnchor="middle" fill={lbl('P')} style={txt}>WAITING</text>
      <text x="190" y="47" textAnchor="middle" fill={lbl('S')} style={txt}>WORK IN</text>
      <text x="350" y="47" textAnchor="middle" fill={lbl('A')} style={txt}>PAID</text>
      <text x="340" y="11" textAnchor="start" fill={lbl('AR')} style={txt}>AUTO-PAID</text>
      <text x="250" y="78" textAnchor="middle" fill={lbl('D')} style={txt}>IN DISPUTE</text>
      <text x="390" y="78" textAnchor="middle" fill={lbl('R')} style={txt}>SETTLED</text>
      {countdownText && (
        <text x="240" y="9" textAnchor="middle" fill={countdownColor || T.auto} style={{ fontFamily: mono, fontSize: '9.5px' }}>{countdownText}</text>
      )}
    </svg>
  );
}
