import { describe, expect, it } from "vitest";
import { checkPassword, passwordStrength } from "./password";

/**
 * Parity with server/src/modules/auth/domain/password-policy.ts.
 *
 * These cases exist to fail loudly if the two drift. The client's whole job
 * here is to predict the server's answer before the round trip; a meter that
 * disagrees is worse than no meter, because it teaches the user that the
 * app's feedback cannot be trusted.
 */
describe("checkPassword - parity with the server policy", () => {
  it("accepts what the server accepts", () => {
    for (const password of ["Kirana@2026", "Brand@New2026", "a1!aaaaa"]) {
      expect(checkPassword(password).valid).toBe(true);
    }
  });

  it("requires eight characters", () => {
    expect(checkPassword("a1!aaaa").valid).toBe(false);
    expect(checkPassword("a1!aaaaa").valid).toBe(true);
  });

  it("requires a number and a special character", () => {
    // The design's caption says "10+ characters with a number" and omits the
    // special character. The server does not, so neither does this.
    expect(checkPassword("aaaaaaaaa!").valid).toBe(false);
    expect(checkPassword("aaaaaaaaa1").valid).toBe(false);
    expect(checkPassword("aaaaaaaa1!").valid).toBe(true);
  });

  it("rejects the denylist even when the rules are satisfied", () => {
    // "Password1!" passes every character-class rule ever written.
    expect(checkPassword("Password1!").valid).toBe(false);
    expect(checkPassword("password1!").failures).toContain(
      "Too common - pick something less guessable",
    );
  });

  it("measures the 72 limit in bytes, not characters", () => {
    // bcrypt truncates bytes. Devanagari is three bytes per character, so 30
    // characters here exceed a limit that a character count would pass.
    const devanagari = "क".repeat(30) + "1!";
    expect(devanagari.length).toBeLessThan(72);
    expect(checkPassword(devanagari).failures).toContain("At most 72 bytes");

    const ascii = "a".repeat(69) + "1!";
    expect(checkPassword(ascii).valid).toBe(true);
  });

  it("reports every failure at once, not the first", () => {
    // A user retyping a password should learn all of what is wrong.
    expect(checkPassword("abc").failures.length).toBeGreaterThan(1);
  });
});

describe("passwordStrength", () => {
  it("never calls an invalid password strong", () => {
    // The bar must not promise something the server will reject.
    const { strength } = passwordStrength("aaaaaaaaaaaaaaaaaaaa");
    expect(strength).toBe("weak");
  });

  it("separates valid-but-thin from genuinely strong", () => {
    expect(passwordStrength("aaaaaaa1!").strength).toBe("fair");
    expect(passwordStrength("Kirana@2026x").strength).toBe("strong");
  });

  it("leads with the first missing rule while invalid", () => {
    expect(passwordStrength("abc").label).toBe("At least 8 characters");
  });
});
