import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import PortalRoutes from './routes/PortalRoutes';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter><PortalRoutes /></BrowserRouter>
  </React.StrictMode>,
);
