import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { useAuthStore } from './store/useAuthStore'

// Kick off auth hydration before render. Critical for magic-link / recovery
// flows where Supabase processes the URL fragment async — we'd otherwise
// render a Login form before the session lands and bounce the user out.
void useAuthStore.getState().hydrate()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
