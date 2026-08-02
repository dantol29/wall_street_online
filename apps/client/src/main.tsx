import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// No StrictMode: it double-mounts every component in dev to catch effect bugs,
// but @playcanvas/react's Script/Application setup does real imperative work
// (attaching input listeners to the canvas, creating physics bodies) that isn't
// safe to run twice — the ready-made first-person-controller's input source
// ended up attached to a stale, discarded mount instead of the live canvas.
createRoot(document.getElementById('root')!).render(<App />)
