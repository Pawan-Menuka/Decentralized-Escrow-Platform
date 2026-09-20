import { useEffect, useRef } from 'react';
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
  error?: string;
}

// Renders the full tx lifecycle on the button itself:
// idle label → "Confirm in your wallet…" → "Sending — on its way ↗" → "Done ✓"
// `write` is the { send/approve, phase } object from useEscrowWrite()/useUsdcApprove().
export default function TxButton({ label, fn, kind = 'primary', disabled = false, onClick, phase = 'idle', onSuccess, error }: TxButtonProps) {
  const notified = useRef(false);
  useEffect(() => {
    if ((phase === 'success' || phase === 'replaced') && onSuccess && !notified.current) {
      notified.current = true;
      onSuccess();
    }
    if (phase === 'idle' || phase === 'simulating' || phase === 'wallet' || phase === 'pending') notified.current = false;
  }, [phase, onSuccess]);
  const busy = ['simulating', 'wallet', 'pending'].includes(phase);
  const text =
    phase === 'simulating' ? 'Checking transaction…'
    : phase === 'wallet' ? 'Confirm in your wallet…'
    : phase === 'pending' ? 'Sending — on its way ↗'
    : phase === 'success' ? 'Done ✓'
    : phase === 'replaced' ? 'Confirmed replacement ✓'
    : phase === 'rejected' ? 'Rejected — try again'
    : phase === 'reverted' ? 'Failed — try again'
    : label;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch' }}>
      <button onClick={onClick} disabled={disabled || busy || phase === 'success' || phase === 'replaced'} style={btn(kind, disabled || busy)}>
        <span style={{ display: 'block', fontWeight: 500 }}>{text}</span>
        {fn && <span style={{ display: 'block', fontFamily: mono, fontSize: 9, opacity: 0.55, marginTop: 2 }}>{fn}</span>}
      </button>
      {error && <span role="alert" style={{ color: '#ff716c', fontSize: 10, maxWidth: 280, marginTop: 5 }}>{error}</span>}
    </span>
  );
}
