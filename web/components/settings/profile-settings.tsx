"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/components/providers/profile-provider";
import { useUpdateProfile } from "@/lib/api/settings";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";

/**
 * Renames and re-colours the active profile.
 *
 * Both were fixed at creation with no way to change them, so a household
 * created as "Personal" stayed "Personal" and every profile in the switcher
 * got whatever colour it was given on day one — which matters most when there
 * are several, since the colour is how you tell them apart at a glance.
 */

/**
 * The server's own palette, copied verbatim from profiles/domain/avatar.ts.
 *
 * Inventing a plausible-looking set of colours here meant none of them matched
 * what a profile had actually been assigned, so no swatch ever showed as
 * selected and saving would have silently restyled the profile to a colour the
 * user did not pick. If these two lists drift the same thing happens again,
 * which is what the assertion below is for.
 */
const COLOURS = [
  "#1F6F5C", // ledger green
  "#3E8E5A", // income green
  "#3B6C89", // health blue
  "#5A5A80", // travel indigo
  "#8A6A1E", // dark gold
  "#7A4A3A", // clay
  "#2F8570", // teal
  "#5A7A3E", // olive
];

export function ProfileSettings() {
  const { active, activeId } = useProfile();

  /*
   * Remounted per profile.
   *
   * useState only reads its initial value on the first render, and the
   * profile list arrives from a query — so the form mounted before the data
   * landed and showed an empty name for a profile that has one. Switching
   * profiles had the same problem in reverse: the form kept the previous
   * profile's name and would have renamed the wrong one on save.
   *
   * A key is the honest fix. The form's state genuinely belongs to one
   * profile, so a different profile deserves a different instance rather than
   * an effect trying to sync fields the user may already have edited.
   */
  // Held back until the profile is actually loaded, so the form's very first
  // render already has its values. Keying alone would not do it: activeId is
  // known before the profile object arrives, so the form would still mount
  // empty and never re-read.
  if (!active || !activeId) return null;

  return <ProfileForm key={activeId} profile={active} />;
}

function ProfileForm({
  profile,
}: {
  profile: NonNullable<ReturnType<typeof useProfile>["active"]>;
}) {
  const { activeId } = useProfile();
  const update = useUpdateProfile(activeId);
  const { toast } = useToast();

  const [name, setName] = useState(profile.name);
  const [colour, setColour] = useState(profile.avatarColor || COLOURS[0]!);

  /*
   * Whatever the profile already has, even if it is not in the palette.
   *
   * A colour set before the palette changed — or by an API call — would
   * otherwise vanish from the row, leaving nothing selected and no way to tell
   * what the current colour even is.
   */
  const swatches = COLOURS.includes(colour) ? COLOURS : [colour, ...COLOURS];

  const changed = name.trim() !== profile.name || colour !== profile.avatarColor;
  const valid = name.trim().length > 0 && name.trim().length <= 60;

  function save() {
    void update
      .mutateAsync({ name: name.trim(), avatarColor: colour })
      .then(() => toast({ title: "Profile updated", tone: "success" }))
      .catch((error: unknown) =>
        toast({
          title: "Couldn't update that profile",
          description:
            error instanceof ApiError ? error.displayMessage : undefined,
          tone: "error",
        }),
      );
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
      <Eyebrow>This profile</Eyebrow>

      <div className="mt-3 flex flex-col gap-4">
        <Input
          label="Name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          error={
            name.length > 0 && !valid ? "Give it a name, up to 60 characters" : undefined
          }
        />

        <div>
          <Eyebrow>Colour</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-2.5">
            {swatches.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={`Use colour ${option}`}
                aria-pressed={colour === option}
                onClick={() => setColour(option)}
                style={{ backgroundColor: option }}
                className={cn(
                  "size-9 rounded-full transition-transform",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green",
                  colour === option
                    ? "scale-110 ring-2 ring-ink ring-offset-2 ring-offset-paper"
                    : "hover:scale-105",
                )}
              />
            ))}
          </div>
        </div>

        <Button
          className="self-start"
          isLoading={update.isPending}
          disabled={!changed || !valid}
          onClick={save}
        >
          Save changes
        </Button>
      </div>
    </section>
  );
}
