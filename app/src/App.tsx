import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { NavBar } from '@/components/NavBar';
import { LandingPage } from '@/pages/LandingPage';
import { MerchantPage } from '@/pages/MerchantPage';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { StatsPage } from '@/pages/StatsPage';
import { DeployPage } from '@/pages/DeployPage';
import { MAINNET_NOT_DEPLOYED } from '@/gasback-config';

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
    <BrowserRouter>
      <div className="min-h-dvh bg-page text-ink">
        <NavBar />
        <main>
          {MAINNET_NOT_DEPLOYED && (
            <div className="px-4 py-2 bg-gas/10 border-b border-gas/30 text-center text-xs font-mono text-gas">
              Arc mainnet selected but no contract deployed yet.{' '}
              <a href="/deploy" className="underline">Deploy now</a>{' '}
              or set <code>VITE_NETWORK=testnet</code> to use the testnet.
            </div>
          )}
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/merchant" element={<MerchantPage />} />
            <Route path="/pay/:merchant" element={<CheckoutPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/deploy" element={<DeployPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
    </MotionConfig>
  );
}
