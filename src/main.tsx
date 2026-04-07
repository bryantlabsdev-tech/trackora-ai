import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import CheckoutSuccess from './CheckoutSuccess'
import './index.css'

function Root() {
  if (typeof window !== 'undefined') {
    const { pathname } = window.location
    if (pathname === '/success' || pathname.endsWith('/success')) {
      return <CheckoutSuccess />
    }
  }
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
