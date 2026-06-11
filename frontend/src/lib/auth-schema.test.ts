import { describe, expect, it } from "vitest";
import { credentialsSchema } from "./auth-schema";

describe("credentialsSchema", () => {
  it("accepts valid credentials and trims email", () => {
    const r = credentialsSchema.parse({ email: "  a@b.co  ", password: "password123" });
    expect(r.email).toBe("a@b.co");
  });
  it("rejects bad email", () => {
    expect(credentialsSchema.safeParse({ email: "nope", password: "password123" }).success).toBe(false);
  });
  it("rejects short and overlong passwords", () => {
    expect(credentialsSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
    expect(credentialsSchema.safeParse({ email: "a@b.co", password: "x".repeat(73) }).success).toBe(false);
  });
});
