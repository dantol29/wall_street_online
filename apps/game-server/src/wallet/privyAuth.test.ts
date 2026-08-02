import { describe, expect, it } from "vitest";
import { verifyPrivyWallet } from "./privyAuth";

describe("verifyPrivyWallet", () => {
  it("returns null without making a network call when Privy isn't configured", async () => {
    // config.privy.enabled is false in this test environment (no PRIVY_APP_ID/SECRET
    // set) — this is the gate that makes wallet linking a no-op rather than an
    // error when the server hasn't been given real Privy credentials.
    await expect(verifyPrivyWallet("any-token")).resolves.toBeNull();
  });
});
