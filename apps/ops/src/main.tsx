import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import PortalRoutes from './routes/PortalRoutes';
import './index.css';

if ('serviceWorker' in navigator && window.isSecureContext) {
  const registerServiceWorker = () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  };
  if (document.readyState === 'complete') registerServiceWorker();
  else window.addEventListener('load', registerServiceWorker, { once: true });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter><PortalRoutes /></BrowserRouter>
  </React.StrictMode>,
);
