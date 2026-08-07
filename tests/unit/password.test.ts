import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/server/security/password.js";

describe("password hashing", () => {
  it("round-trips a password without storing plaintext", async () => {
    const hash = await hashPassword("family secret");
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain("family secret");
    await expect(verifyPassword("family secret", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
  });

  it("uses a different salt for each hash", async () => {
    const [first, second] = await Promise.all([hashPassword("family secret"), hashPassword("family secret")]);
    expect(first).not.toBe(second);
  });

  it("returns false for malformed and unsupported hashes without throwing", async () => {
    for (const hash of ["", "bcrypt$salt$key", "scrypt$only-salt", "scrypt$%%%$%%%"]) {
      await expect(verifyPassword("family secret", hash)).resolves.toBe(false);
    }
  });

  it("rejects empty passwords when hashing", async () => {
    await expect(hashPassword("")).rejects.toThrow(/empty/i);
  });

  it("round-trips Unicode passwords", async () => {
    const password = "👶 famille 密碼";
    const hash = await hashPassword(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });
});
