import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { wagmiConfig } from './config/wagmi';
import Shell from './components/Shell';
import Landing from './pages/Landing';
import Jobs from './pages/Jobs';
import CreateJob from './pages/CreateJob';
import JobDetail from './pages/JobDetail';
import ArbitratorDesk from './pages/ArbitratorDesk';
import Security from './pages/Security';
import ConfigurationError from './components/ConfigurationError';
import { configurationIssues, hasValidConfiguration } from './config/env';

const qc = new QueryClient();

const root = document.getElementById('root');
if (!root) throw new Error('The root application element is missing.');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    {!hasValidConfiguration ? <ConfigurationError issues={configurationIssues} /> : <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <RainbowKitProvider theme={darkTheme({ accentColor: '#39A0FF', borderRadius: 'small', fontStack: 'system' })}>
          <BrowserRouter>
            <Routes>
              <Route element={<Shell />}>
                <Route path="/" element={<Landing />} />
                <Route path="/jobs" element={<Jobs />} />
                <Route path="/create" element={<CreateJob />} />
                <Route path="/jobs/:jobId" element={<JobDetail />} />
                <Route path="/arbitrator" element={<ArbitratorDesk />} />
                <Route path="/disputes" element={<Navigate to="/arbitrator" replace />} />
                <Route path="/about/security" element={<Security />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>}
  </React.StrictMode>
);
