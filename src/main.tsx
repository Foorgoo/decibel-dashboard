import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { IS_TRADING_MODE } from './config/appMode';
import './index.css';

const TradingRoot = lazy(() => import('./features/trading/TradingRoot').then((module) => ({ default: module.TradingRoot })));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {IS_TRADING_MODE ? (
      <Suspense fallback={null}>
        <TradingRoot />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>
);
