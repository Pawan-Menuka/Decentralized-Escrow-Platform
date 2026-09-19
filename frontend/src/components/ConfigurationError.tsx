import { T, mono, sans } from '../theme';

export default function ConfigurationError({ issues }: { issues: readonly string[] }) {
  return (
    <main style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: sans, display: 'grid', placeItems: 'center', padding: 24 }}>
      <section role="alert" style={{ width: 'min(620px, 100%)', border: `1px solid ${T.red}`, background: T.panel, padding: 28 }}>
        <div style={{ color: T.red, fontFamily: mono, fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>CONFIGURATION REQUIRED</div>
        <h1 style={{ fontSize: 22, margin: '0 0 10px' }}>Holdfast is not configured for Sepolia.</h1>
        <p style={{ color: T.sub, lineHeight: 1.6 }}>The site has stopped before connecting to any contract. Configure these public deployment values and reload:</p>
        <ul style={{ color: T.body, lineHeight: 1.8, paddingLeft: 22 }}>
          {issues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
        <p style={{ color: T.mut, fontFamily: mono, fontSize: 11, marginBottom: 0 }}>Secrets such as PINATA_JWT belong only in the server environment.</p>
      </section>
    </main>
  );
}
