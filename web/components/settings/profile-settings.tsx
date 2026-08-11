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

/** The palette the profile switcher already draws from. */
const COLOURS = [
  "#1F6F5C",
  "#C8823C",
  "#8A5A44",
  "#4A6FA5",
  "#7A5C99",
  "#A4553F",
];

export function ProfileSettings() {
  const { active, activeId } = useProfile();
  const update = useUpdateProfile(activeId);
  const { toast } = useToast();

  const [name, setName] = useState(active?.name ?? "");
  const [colour, setColour] = useState(active?.avatarColor ?? COLOURS[0]!);

  if (!active) return null;

  const changed =
    name.trim() !== active.name || colour !== active.avatarColor;
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
            {COLOURS.map((option) => (
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
