import { describe, expect, it } from "vitest";

import { hashPassword, PASSWORD_HASH_ITERATIONS, verifyPassword } from "./crypto";

describe("password hashing", () => {
  it("stays within the Cloudflare Workers PBKDF2 limit and round-trips", async () => {
    expect(PASSWORD_HASH_ITERATIONS).toBeLessThanOrEqual(100_000);
    const stored = await hashPassword("SbekTest!2027-org");

    expect(stored.split("$")[1]).toBe(String(PASSWORD_HASH_ITERATIONS));
    await expect(verifyPassword("SbekTest!2027-org", stored)).resolves.toBe(true);
    await expect(verifyPassword("not-the-password", stored)).resolves.toBe(false);
  });
});
