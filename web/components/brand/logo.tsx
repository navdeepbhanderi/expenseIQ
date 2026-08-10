import { cn } from "@/lib/cn";

/**
 * The ledger stack — design 7a.
 *
 * "Three ruled lines that step up like a balance, with the rupee's double bar
 * built in." Two full rules are the rupee's twin bars and the ruled lines of a
 * household ledger; the short marigold rule is the entry still waiting on you.
 * That third rule is the product's whole idea in one glyph, which is why it is
 * always marigold — the same colour the app reserves for "needs your eye".
 *
 * Every dimension is a percentage of `size` rather than a hardcoded pixel, so
 * the 16px favicon and the 104px app icon are the same mark. The design's two
 * specimens (76px and 104px) agree on these ratios:
 *
 *   radius 25% · horizontal padding 21% · rule height 9% · gap 9% · short 58%
 */

const RATIO = {
  radius: 0.25,
  paddingX: 0.21,
  ruleHeight: 0.09,
  gap: 0.09,
  /** Emitted verbatim: 0.58 * 100 is 57.99999999999999 in binary float. */
  shortWidth: "58%",
} as const;

export type LogoVariant = "brand" | "night" | "mono" | "soft";

interface MarkColours {
  ground: string;
  rule: string;
  /** The waiting entry. Marigold in every variant that has a colour to spare. */
  pending: string;
  border?: string;
}

const VARIANTS: Record<LogoVariant, MarkColours> = {
  brand: { ground: "var(--green)", rule: "#FAF6EF", pending: "#E39B2E" },
  night: { ground: "#141210", rule: "#F5F0E8", pending: "#D9A441" },
  // One-colour knockout, for stamps, favicons and anywhere colour is not
  // available. The design notes the mark must survive this.
  mono: {
    ground: "var(--paper)",
    rule: "var(--ink)",
    pending: "var(--ink)",
    border: "var(--line)",
  },
  soft: {
    ground: "var(--green-soft)",
    rule: "var(--green)",
    pending: "var(--green)",
    border: "var(--green)",
  },
};

export function LogoMark({
  size = 32,
  variant = "brand",
  rounded = false,
  className,
}: {
  size?: number;
  variant?: LogoVariant;
  /** Fully round rather than a squircle — the design's badge treatment. */
  rounded?: boolean;
  className?: string;
}) {
  const colours = VARIANTS[variant];
  const rule = Math.max(1, Math.round(size * RATIO.ruleHeight));
  const gap = Math.max(1, Math.round(size * RATIO.gap));

  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 flex-col justify-center", className)}
      style={{
        width: size,
        height: size,
        gap,
        padding: `0 ${size * RATIO.paddingX}px`,
        borderRadius: rounded ? "9999px" : size * RATIO.radius,
        background: colours.ground,
        border: colours.border ? `1px solid ${colours.border}` : undefined,
        boxSizing: "border-box",
      }}
    >
      <span
        style={{ height: rule, borderRadius: 99, background: colours.rule }}
      />
      <span
        style={{ height: rule, borderRadius: 99, background: colours.rule }}
      />
      <span
        style={{
          height: rule,
          width: RATIO.shortWidth,
          borderRadius: 99,
          background: colours.pending,
        }}
      />
    </span>
  );
}

export function Wordmark({
  className,
  style,
  tagline = false,
}: {
  className?: string;
  style?: React.CSSProperties;
  tagline?: boolean;
}) {
  return (
    <span className={cn("flex flex-col", className)} style={style}>
      <span className="font-display leading-none text-ink">
        Expense<span className="text-green">IQ</span>
      </span>
      {tagline && (
        <span className="mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          your money, in your words
        </span>
      )}
    </span>
  );
}

/** Mark plus wordmark — the lockup used in the header and footer. */
export function Logo({
  size = 32,
  variant = "brand",
  tagline = false,
  className,
  wordmarkClassName,
}: {
  size?: number;
  variant?: LogoVariant;
  tagline?: boolean;
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} variant={variant} />
      <Wordmark
        tagline={tagline}
        className={wordmarkClassName}
        // Scales with the mark so the lockup holds at any size.
        style={{ fontSize: size * 0.62 }}
      />
      {/*
       * No sr-only "ExpenseIQ" here: the wordmark is real text and already
       * announces. Adding a hidden label would make a screen reader say the
       * name twice — the mark is aria-hidden precisely so it does not.
       */}
    </span>
  );
}
