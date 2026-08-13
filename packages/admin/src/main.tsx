import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.js'
import './styles/base.css'

// #root is guaranteed by index.html, which this app also owns — a browser
// bundle deliberately does not depend on @cogenta/core (CogentaError and its
// `code`/`hint` shape) just for this: that package pulls in db/queue/storage
// drivers built for Node, none of which belong in the admin's bundle.
const container = document.getElementById('root') as HTMLElement

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
