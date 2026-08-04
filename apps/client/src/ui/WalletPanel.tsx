import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

export interface WalletLinkResult {
  success: boolean;
  address?: string;
  chain?: string;
  message?: string;
}

interface WalletPanelProps {
  connected: boolean;
  onLinkWallet: (authToken: string) => Promise<WalletLinkResult>;
}

/**
 * Wallet connection UI backed by Privy: `login()` opens Privy's own connect
 * modal (configured for wallet-only login — see main.tsx), then once
 * authenticated this fetches a Privy access token and hands it to the server
 * for verification (see MultiplayerClient.linkWallet).
 */
export function WalletPanel({ connected, onLinkWallet }: WalletPanelProps) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const [linkedAddress, setLinkedAddress] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const linkedForUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !authenticated || !connected || !user) return;
    if (linkedForUserIdRef.current === user.id) return;

    linkedForUserIdRef.current = user.id;
    setLinking(true);
    setErrorMessage(null);

    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Could not get a Privy access token.");
        const result = await onLinkWallet(token);
        if (!result.success || !result.address) {
          throw new Error(result.message || "Could not link wallet.");
        }
        setLinkedAddress(result.address);
      } catch (error) {
        linkedForUserIdRef.current = null;
        setErrorMessage(error instanceof Error ? error.message : "Failed to link wallet.");
      } finally {
        setLinking(false);
      }
    })();
  }, [ready, authenticated, connected, user, getAccessToken, onLinkWallet]);

  if (!ready) return null;

  if (linkedAddress) {
    const handleLogout = (): void => {
      setLinkedAddress(null);
      linkedForUserIdRef.current = null;
      void logout();
    };

    return (
      <section className="wallet-panel" aria-label="Wallet">
        <div className="wallet-panel__linked">
          <span className="wallet-panel__dot" aria-hidden="true" />
          <span className="wallet-panel__address">{linkedAddress}</span>
          <button type="button" className="wallet-panel__logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="wallet-panel" aria-label="Wallet">
      <div className="wallet-panel__row">
        <button type="button" className="wallet-panel__button" disabled={linking} onClick={() => login()}>
          {linking ? "Linking…" : "Connect Wallet"}
        </button>
      </div>
      {errorMessage && <div className="wallet-panel__message">{errorMessage}</div>}
    </section>
  );
}
