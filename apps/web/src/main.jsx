import React, { useLayoutEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import MetaRouteTracker from './components/MetaRouteTracker.jsx';
import { RouteSeoDefaults } from './components/SEO.jsx';
import { startWebVitalsMonitoring } from './lib/webVitals.js';
import './index.css';

if (!document.title) document.title = 'Maria Clara Clothing | Premium Filipino Streetwear';
startWebVitalsMonitoring();

function SeoFallbackCleanup() {
  useLayoutEffect(() => {
    document.getElementById('seo-fallback')?.remove();
  }, []);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SeoFallbackCleanup />
    <BrowserRouter>
      <RouteSeoDefaults />
      <MetaRouteTracker />
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
