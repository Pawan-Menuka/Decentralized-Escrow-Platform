// Holdfast design tokens — single source of truth for the visual system.
export const T = {
  bg: '#0B0E14', panel: '#0D1119', raised: '#11161F',
  line: '#232B38', hair: '#161D29', dim: '#3A4354', mut: '#5A6474',
  sub: '#8B95A6', body: '#B8C2D1', text: '#E8ECF2',
  blue: '#39A0FF', blueT: '#8FCBFF', green: '#3FBE7E', greenT: '#6FD9A2',
  amber: '#E0A73C', red: '#E5484D', violet: '#A78BE0', violetT: '#C4A9F0',
  auto: '#7C9CD8', gold: '#B98A2E', goldLine: '#4A3C1E', cancel: '#4A5160',
};
export const mono = "'IBM Plex Mono', monospace";
export const sans = "'IBM Plex Sans', sans-serif";

// Milestone state enum — order MUST match the contract's enum.
// FreelanceEscrow.MilestoneState is: NONE, PENDING, SUBMITTED, APPROVED, DISPUTED,
// RESOLVED, AUTO_RELEASED — index 0 is the "does not exist" sentinel, so the list
// is offset by one from the UI-only vocabulary below. CANCELLED is not a contract
// milestone state; useEscrow synthesises it for milestones of a cancelled job
// (cancellation is only possible pre-acceptance, so they're all still PENDING).
export const STATE = ['NONE', 'PENDING', 'SUBMITTED', 'APPROVED', 'DISPUTED', 'RESOLVED', 'AUTO_RELEASED'];
export const STATE_COLOR = {
  PENDING: T.mut, SUBMITTED: T.amber, APPROVED: T.green,
  DISPUTED: T.red, RESOLVED: T.violet, AUTO_RELEASED: T.auto, CANCELLED: T.cancel,
};
export const STATE_LABEL = {
  PENDING: 'Not started', SUBMITTED: 'Needs review', APPROVED: 'Paid',
  DISPUTED: 'In dispute', RESOLVED: 'Split settled', AUTO_RELEASED: 'Auto-paid', CANCELLED: 'Cancelled',
};

export function btn(kind, disabled) {
  const base = { fontFamily: sans, fontSize: 13, padding: '9px 18px', borderRadius: 2, cursor: disabled ? 'default' : 'pointer', background: 'transparent', textAlign: 'left' };
  if (disabled) return { ...base, border: `1px solid ${T.line}`, color: T.mut };
  const kinds = {
    primary: { background: 'rgba(57,160,255,0.1)', border: `1px solid ${T.blue}`, color: T.blueT, fontWeight: 500 },
    green: { background: 'rgba(63,190,126,0.08)', border: `1px solid ${T.green}`, color: T.greenT, fontWeight: 500 },
    violet: { background: 'rgba(167,139,224,0.08)', border: `1px solid ${T.violet}`, color: T.violetT, fontWeight: 500 },
    danger: { border: '1px solid rgba(229,72,77,0.45)', color: T.red },
    quiet: { border: `1px solid ${T.line}`, color: T.sub },
  };
  return { ...base, ...(kinds[kind] || kinds.quiet) };
}

export function ticket(color) {
  return { display: 'inline-flex', alignItems: 'center', padding: '3px 9px', border: `1px solid ${T.line}`, borderLeft: `3px solid ${color}`, color, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' };
}

export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');
