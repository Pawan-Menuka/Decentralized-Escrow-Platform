import { Outlet, NavLink, Link } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { T, mono, sans, btn } from '../theme';
import { ACTIVE_CHAIN, EXPLORER } from '../config/wagmi';
import { ESCROW_ADDRESS } from '../config/contract';
import type { CSSProperties } from 'react';

function WrongNetworkGate() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  if (!isConnected || chainId === ACTIVE_CHAIN.id) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(11,14,20,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ border: `1px solid ${T.line}`, background: '#10151E', padding: '36px 40px', maxWidth: 440 }}>
        <div style={{ fontFamily: mono, color: T.red, fontSize: 11, letterSpacing: 2, marginBottom: 14 }}>WRONG NETWORK</div>
        <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 6, color: T.text }}>Your wallet is on the wrong network.</div>
        <div style={{ color: T.sub, fontSize: 13, lineHeight: 1.6, marginBottom: 22 }}>
          This escrow lives on {ACTIVE_CHAIN.name}. You can keep browsing, but to act on a job your wallet needs to switch over.
        </div>
        <button onClick={() => switchChain({ chainId: ACTIVE_CHAIN.id })} style={btn('primary')}>Switch to {ACTIVE_CHAIN.name}</button>
      </div>
    </div>
  );
}

const navStyle = ({ isActive }: { isActive: boolean }): CSSProperties => ({
  color: isActive ? T.text : T.sub, fontSize: 13,
  borderBottom: isActive ? `1px solid ${T.blue}` : '1px solid transparent', paddingBottom: 2,
});

export default function Shell() {
  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: sans, display: 'flex', flexDirection: 'column' }}>
      <WrongNetworkGate />
      <header style={{ height: 54, borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', gap: 28, padding: '0 22px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <Link to="/" style={{ fontFamily: mono, fontWeight: 600, fontSize: 14, letterSpacing: 3, color: T.text }}>HOLDFAST</Link>
          <span style={{ fontSize: 11, color: T.mut }}>escrow that keeps its word</span>
        </div>
        <nav style={{ display: 'flex', gap: 20 }}>
          <NavLink to="/jobs" style={navStyle}>Jobs</NavLink>
          <NavLink to="/create" style={navStyle}>Create a job</NavLink>
          <NavLink to="/arbitrator" style={navStyle}>Arbitrator</NavLink>
          <NavLink to="/about/security" style={navStyle}>Security</NavLink>
        </nav>
        <div style={{ flex: 1 }} />
        {ACTIVE_CHAIN.testnet && (
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 1, color: T.gold, border: `1px solid ${T.goldLine}`, padding: '3px 8px' }}>
            TEST NETWORK · NO REAL MONEY
          </div>
        )}
        <ConnectButton showBalance={true} accountStatus="address" chainStatus="none" />
      </header>
      <Outlet />
      <footer style={{ borderTop: `1px solid ${T.line}`, padding: '12px 22px', display: 'flex', gap: 24, alignItems: 'center', fontFamily: mono, fontSize: 10, color: T.mut }}>
        <a href={`${EXPLORER}/address/${ESCROW_ADDRESS}`} target="_blank" rel="noreferrer" style={{ color: T.mut }}>
          contract {ESCROW_ADDRESS ? `${ESCROW_ADDRESS.slice(0, 6)}…${ESCROW_ADDRESS.slice(-4)}` : '—'} ↗ verified
        </a>
        <span>everything on this site is public, on-chain data</span>
        <div style={{ flex: 1 }} />
        {ACTIVE_CHAIN.testnet && <span style={{ color: T.gold }}>SEPOLIA TEST NETWORK — NO REAL MONEY</span>}
        <a href="https://github.com/Pawan-Menuka/Decentralized-Escrow-Platform" target="_blank" rel="noreferrer" style={{ color: T.mut }}>GitHub ↗</a>
      </footer>
    </div>
  );
}
