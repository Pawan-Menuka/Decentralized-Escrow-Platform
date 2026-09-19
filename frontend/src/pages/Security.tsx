import { T, mono } from '../theme';

export default function Security() {
  return (
    <main style={{ flex: 1, maxWidth: 820, width: '100%', margin: '0 auto', padding: '48px 24px 72px', boxSizing: 'border-box' }}>
      <div style={{ fontFamily: mono, color: T.gold, fontSize: 10, letterSpacing: 2 }}>TESTNET SAFETY</div>
      <h1 style={{ fontSize: 28, fontWeight: 500 }}>Security and trust assumptions</h1>
      <p style={{ color: T.body, lineHeight: 1.7 }}>Holdfast is an unaudited Sepolia demonstration. Do not use real funds. Escrow rules run in the deployed contract, while each job snapshots a trusted arbitrator who can make a final split after a dispute.</p>
      <p style={{ color: T.sub, lineHeight: 1.7 }}>The contract owner can change protocol fees within the contract&rsquo;s 5% cap. Uploaded deliverables and evidence are public on IPFS. Wallet addresses, transactions, and activity are public on Ethereum.</p>
    </main>
  );
}
