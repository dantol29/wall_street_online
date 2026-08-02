import { PrivyClient } from "@privy-io/server-auth";
import { config } from "../config";

export interface VerifiedWallet {
  address: string;
  chain: string;
  /** Privy's own stable user DID — durable across wallet rotations/relinks, unlike `address`. Used to key persistent office identity. */
  userId: string;
}

let client: PrivyClient | null = null;

function getClient(): PrivyClient {
  if (!client) {
    client = new PrivyClient(config.privy.appId, config.privy.appSecret);
  }
  return client;
}

/**
 * Verifies a Privy access token (minted client-side by `usePrivy().getAccessToken()`
 * after the user connects/signs in with their wallet through Privy's own flow)
 * and returns that user's primary linked wallet. Returns null for an invalid/
 * expired token or a Privy user with no linked wallet — never throws, since
 * this only gates an optional identity upgrade, not room access.
 */
export async function verifyPrivyWallet(authToken: string): Promise<VerifiedWallet | null> {
  if (!config.privy.enabled) return null;

  const privy = getClient();
  try {
    const claims = await privy.verifyAuthToken(authToken);
    const user = await privy.getUserById(claims.userId);
    const address = user.wallet?.address;
    if (!address) return null;
    return { address, chain: user.wallet?.chainType ?? "unknown", userId: claims.userId };
  } catch {
    return null;
  }
}
