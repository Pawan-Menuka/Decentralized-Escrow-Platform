import { useEffect } from 'react';
import { btn, mono } from '../theme';
import type { TransactionPhase } from '../types';

interface TxButtonProps {
  label: string;
  fn?: string;
  kind?: 'primary' | 'green' | 'violet' | 'danger' | 'quiet';
  disabled?: boolean;
  onClick: () => void;
  phase?: TransactionPhase;
  onSuccess?: () => void;
}

// Renders the full tx lifecycle on the button itself:
// idle label → "Confirm in your wallet…" → "Sending — on its way ↗" → "Done ✓"
// `write` is the { send/approve, phase } object from useEscrowWrite()/useUsdcApprove().
export default function TxButton({ label, fn, kind = 'primary', disabled = false, onClick, phase = 'idle', onSuccess }: TxButtonProps) {
  useEffect(() => {
    if (phase === 'success' && onSuccess) onSuccess();
  }, [phase, onSuccess]);
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
