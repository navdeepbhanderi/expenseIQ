"use client";

import { useStoredValue } from "@/lib/stored-value";

/**
 * Whether the voice capture affordances are shown.
 *
 * Voice is the product's headline, but it is not universally wanted: an open
 * office, a shared room, a browser whose speech recognition is unreliable, or
 * simply a preference for typing. Someone in that position was stuck with a
 * mic button they would never press taking the most prominent position on
 * every screen.
 *
 * A local preference rather than a server one, deliberately. It describes this
 * device - the office laptop, not the phone - and syncing it across devices
 * would get it wrong on at least one of them. It also means turning it off
 * takes effect instantly with no request.
 *
 * Typed capture and manual entry are never affected by this. Switching voice
 * off must never leave someone with no way to record an expense.
 */
const KEY = "eiq_voice_enabled";

export function useVoiceEnabled(): [boolean, (enabled: boolean) => void] {
  const [stored, store] = useStoredValue(KEY);

  // Defaults to on: it is what the product is for, and someone who has never
  // expressed a preference should meet the feature.
  return [stored !== "off", (enabled) => store(enabled ? "on" : "off")];
}
