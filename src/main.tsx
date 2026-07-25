import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './app/AppShell';
import './styles/globals.css';
import './styles/usability.css';
import './styles/experience.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);
