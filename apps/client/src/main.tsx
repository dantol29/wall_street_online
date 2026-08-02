import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import './index.css'
import App from './App.tsx'

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined

// No StrictMode: it double-mounts every component in dev to catch effect bugs,
// but @playcanvas/react's Script/Application setup does real imperative work
// (attaching input listeners to the canvas, creating physics bodies) that isn't
// safe to run twice — the ready-made first-person-controller's input source
// ended up attached to a stale, discarded mount instead of the live canvas.
const root = createRoot(document.getElementById('root')!)

// Wallet login is optional (see WalletPanel) — without an App ID configured,
// skip PrivyProvider entirely rather than render it against an empty appId.
root.render(
  PRIVY_APP_ID ? (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['wallet'],
        embeddedWallets: { ethereum: { createOnLogin: 'off' } },
        appearance: { walletChainType: 'ethereum-and-solana' },
      }}
    >
      <App />
    </PrivyProvider>
  ) : (
    <App />
  ),
)
