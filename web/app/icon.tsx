import { ImageResponse } from "next/og";

/**
 * The favicon — the ledger stack mark alone, which design 7a states is the
 * app icon.
 *
 * Generated rather than shipped as a file so it stays in step with the
 * component: the same ratios (25% radius, 21% padding, 9% rules, 58% short
 * rule) produce it. Colours are literals here because this renders outside the
 * document and has no access to the CSS variables.
 */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  const s = size.width;
  const rule = Math.round(s * 0.09);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: Math.round(s * 0.09),
          padding: `0 ${s * 0.21}px`,
          background: "#1F6F5C",
          borderRadius: s * 0.25,
        }}
      >
        <div style={{ height: rule, borderRadius: 99, background: "#FAF6EF" }} />
        <div style={{ height: rule, borderRadius: 99, background: "#FAF6EF" }} />
        {/* The entry still waiting on you. */}
        <div
          style={{
            height: rule,
            width: "58%",
            borderRadius: 99,
            background: "#E39B2E",
          }}
        />
      </div>
    ),
    size,
  );
}
