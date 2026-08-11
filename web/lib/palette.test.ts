import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The web copy of the avatar palette must match the server's.
 *
 * They are two literals in two languages, and when they drifted no swatch in
 * the profile form matched the colour a profile actually had — so nothing
 * showed as selected, and saving would have restyled the profile to a colour
 * the user never chose.
 */
describe("avatar palette", () => {
  it("matches profiles/domain/avatar.ts", () => {
    const hexes = (source: string) =>
      [...source.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0].toUpperCase());

    const server = hexes(
      readFileSync(
        resolve(
          process.cwd(),
          "../server/src/modules/profiles/domain/avatar.ts",
        ),
        "utf8",
      )
        .split("AVATAR_PALETTE")[1]!
        .split("]")[0]!,
    );

    const web = hexes(
      readFileSync(
        resolve(process.cwd(), "components/settings/profile-settings.tsx"),
        "utf8",
      )
        .split("const COLOURS")[1]!
        .split("]")[0]!,
    );

    expect(web).toEqual(server);
  });
});
