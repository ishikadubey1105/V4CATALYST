import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { useStore } from './store/useStore'
import { credentials } from './data/mock'

// Dev-only shortcut for screenshots: ?as=<username> signs in through the normal credential check (mock mode only).
if (import.meta.env.DEV && import.meta.env.VITE_API_MODE !== 'http') {
  const as = new URLSearchParams(location.search).get('as')
  if (as && credentials[as]) useStore.getState().signIn(as, credentials[as])
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
