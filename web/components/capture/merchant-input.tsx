"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { useProfile } from "@/components/providers/profile-provider";
import { useMerchants } from "@/lib/api/settings";

/**
 * A merchant field that suggests places you have already been — design 6b.
 *
 * The endpoint has always existed, ordered by how often each merchant has been
 * seen, and nothing called it. Without it every entry retypes "Swiggy" from
 * scratch and, worse, spells it differently each time — "swiggy", "Swiggy*BLR",
 * "swigy" — so the merchant column fragments into near-duplicates and the
 * recurring-payment detector, which groups on merchant, stops seeing a
 * pattern that is plainly there.
 *
 * Built on a native datalist rather than a custom popover. It gets keyboard
 * behaviour, screen-reader semantics and mobile rendering right for free, and
 * unlike a combobox it does not force a choice: a merchant you have never
 * visited is a normal thing to type, not an error.
 */
export function MerchantInput({
  value,
  onChange,
  label = "Where",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const { activeId } = useProfile();
  const listId = useId();

  // The hook stays idle below two characters — at one character everything
  // matches, which is not a suggestion.
  const { data: merchants = [] } = useMerchants(activeId, value);

  return (
    <>
      <Input
        label={label}
        placeholder="Swiggy, D-Mart, the chemist"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        autoComplete="off"
        hint={
          merchants.length > 0
            ? `${merchants.length} you've used before`
            : undefined
        }
      />

      <datalist id={listId}>
        {merchants.map((merchant) => (
          <option key={merchant.id} value={merchant.normalizedName} />
        ))}
      </datalist>
    </>
  );
}
