import { useEffect } from 'react';
import { btn, mono } from '../theme';

// Renders the full tx lifecycle on the button itself:
// idle label → "Confirm in your wallet…" → "Sending — on its way ↗" → "Done ✓"
// `write` is the { send/approve, phase } object from useEscrowWrite()/useUsdcApprove().
export default function TxButton({ label, fn, kind = 'primary', disabled, onClick, phase = 'idle', onSuccess }) {
  useEffect(() => {
    if (phase === 'success' && onSuccess) onSuccess();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const busy = phase !== 'idle';
  const text =
    phase === 'wallet' ? 'Confirm in your wallet…'
    : phase === 'pending' ? 'Sending — on its way ↗'
    : phase === 'success' ? 'Done ✓'
    : label;
  return (
    <button onClick={onClick} disabled={disabled || busy} style={btn(kind, disabled || busy)}>
      <span style={{ display: 'block', fontWeight: 500 }}>{text}</span>
      {fn && <span style={{ display: 'block', fontFamily: mono, fontSize: 9, opacity: 0.55, marginTop: 2 }}>{fn}</span>}
    </button>
  );
}
