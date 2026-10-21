import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { LocaleProvider } from './i18n';
import '@fontsource/geist/latin-300.css';
import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-500.css';
import '@fontsource/geist/latin-700.css';
import '@fontsource/geist-mono/latin-300.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/libre-franklin/latin-700-italic.css';
import '@fontsource/libre-franklin/latin-900-italic.css';
// Arabic calligraphy for the Zamzam chapter: unicode-range limited, so it only downloads when Arabic text shows
import '@fontsource/amiri/arabic-700.css';
import './styles/base.css';
import './styles/chrome.css';
import './styles/loader.css';
import './styles/home.css';
import './styles/atmosphere.css';
// Product page, bag and shared commerce controls.
import './styles/shop.css';
import './styles/shop-extras.css';
// Pointer layer, countdown, saved items, notices, stores.
import './styles/fx.css';
import './styles/shop-page.css';
// Liquid glass surface language, loaded last so it only restyles surfaces.
import './styles/glass.css';
import './styles/pages.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </React.StrictMode>
);
