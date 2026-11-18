import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, generateRandomPassword } from "../src/auth/password";

describe("password hashing (PBKDF2-SHA256)", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^pbkdf2\$100000\$/);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("secret-one");
    expect(await verifyPassword("secret-two", hash)).toBe(false);
  });

  it("produces a unique salt per hash", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "sha256$abc$def")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2$bad$!!!$!!!")).toBe(false);
  });

  it("never stores the plain password", async () => {
    const password = "visible-secret-123";
    const hash = await hashPassword(password);
    expect(hash).not.toContain(password);
  });

  it("generates usable random passwords", () => {
    const password = generateRandomPassword(16);
    expect(password).toHaveLength(16);
    expect(generateRandomPassword(16)).not.toBe(password);
  });
});
