"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/controls";
import { Eyebrow } from "@/components/ui/display";
import { Pill } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/components/providers/profile-provider";
import {
  useLlmCredential,
  useLlmProviders,
  useRemoveLlmCredential,
  useSetLlmCredential,
} from "@/lib/api/settings";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";

/**
 * Choose whose AI reads your expenses.
 *
 * ExpenseIQ is open source and self-hostable, so depending on the hosted
 * platform's provider quota should be a convenience rather than a requirement.
 * The platform's own key works out of the box; anyone who wants their own
 * quota, a different provider or a stronger model can supply a key.
 *
 * The copy here is deliberately precise about what storing a key does and does
 * not mean. The server has to decrypt it to call the provider, so promising
 * that nobody can ever read it would be false - and a security claim that is
 * slightly false is worse than none, because it is the one people rely on.
 */
export function AiProvider() {
  const { activeId } = useProfile();
  const { data: providers = [] } = useLlmProviders();
  const { data: credential, isPending } = useLlmCredential(activeId);
  const save = useSetLlmCredential(activeId);
  const remove = useRemoveLlmCredential(activeId);
  const { toast } = useToast();

  const configured = credential?.configured ?? false;

  const [mode, setMode] = useState<"platform" | "own" | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");

  if (isPending) return null;

  // Local choice wins while editing; otherwise what is actually stored.
  const showing = mode ?? (configured ? "own" : "platform");
  const provider =
    providers.find((p) => p.id === (providerId ?? credential?.provider)) ??
    providers[0];
  const models = provider?.models ?? [];
  const model =
    models.find((m) => m.id === (modelId ?? credential?.model)) ?? models[0];

  const keyLooksRight =
    provider && apiKey.trim().length > 0
      ? new RegExp(provider.keyPattern).test(apiKey.trim())
      : null;

  const canSave = Boolean(provider && model && keyLooksRight);

  function submit() {
    if (!provider || !model) return;

    void save
      .mutateAsync({
        provider: provider.id,
        model: model.id,
        apiKey: apiKey.trim(),
      })
      .then(() => {
        // Cleared immediately. There is no reason for the key to stay in a
        // React state tree once the request has gone.
        setApiKey("");
        toast({ title: "Your key is in use", tone: "success" });
      })
      .catch((error: unknown) =>
        toast({
          title: "Couldn't save that key",
          description:
            error instanceof ApiError ? error.displayMessage : undefined,
          tone: "error",
        }),
      );
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
      <Eyebrow>Which AI reads your expenses</Eyebrow>
      <p className="mt-1 text-[13px] text-ink-muted">
        ExpenseIQ is open source. The platform&rsquo;s own provider works out of
        the box - or use your own key for your own quota and model.
      </p>

      <Segmented
        aria-label="AI provider"
        className="mt-3.5 w-full"
        value={showing}
        onValueChange={(value) => setMode(value as "platform" | "own")}
        options={[
          { value: "platform", label: "Use the platform" },
          { value: "own", label: "Use my own key" },
        ]}
      />

      {showing === "platform" ? (
        <div className="mt-4">
          <p className="text-sm text-ink">
            Nothing to set up. Parsing runs on the platform&rsquo;s provider.
          </p>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Your expense text is sent to that provider to be read. It is not
            used to train anything, and nothing is stored there by us.
          </p>

          {configured && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 text-spend hover:bg-spend/10"
              isLoading={remove.isPending}
              onClick={() => {
                void remove
                  .mutateAsync()
                  .then(() => {
                    setMode("platform");
                    toast({ title: "Back on the platform provider", tone: "info" });
                  })
                  .catch(() =>
                    toast({ title: "Couldn't remove that key", tone: "error" }),
                  );
              }}
            >
              Remove my key and use the platform
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {/* What is stored right now, if anything. */}
          {configured && (
            <div className="rounded-[var(--radius-control)] border border-line bg-paper-sunken p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <KeyRound className="size-4 text-ink-muted" aria-hidden="true" />
                <span className="font-mono text-[13px] text-ink">
                  {credential?.keyHint}
                </span>
                <Pill tone="neutral">{credential?.provider}</Pill>
                <Pill tone="neutral">{credential?.model}</Pill>
              </div>

              {/*
               * Whether the key has ever actually worked - not merely whether
               * it was accepted by the shape check when it was saved.
               */}
              <p
                className={cn(
                  "mt-2 flex items-start gap-1.5 text-[13px]",
                  credential?.lastError ? "text-spend" : "text-ink-muted",
                )}
              >
                {credential?.lastError ? (
                  <>
                    <TriangleAlert
                      className="mt-0.5 size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      Last call failed: {credential.lastError} - parsing fell
                      back to the platform, so nothing was lost.
                    </span>
                  </>
                ) : credential?.lastUsedAt ? (
                  <>
                    <CheckCircle2
                      className="mt-0.5 size-3.5 shrink-0 text-income"
                      aria-hidden="true"
                    />
                    <span>
                      Working - last used{" "}
                      {new Date(credential.lastUsedAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </>
                ) : (
                  <span>Saved, but not used yet.</span>
                )}
              </p>
            </div>
          )}

          <Select
            label="Provider"
            value={provider?.id}
            onValueChange={(value) => {
              setProviderId(value);
              // The old model belongs to the old provider.
              setModelId(null);
            }}
            options={providers.map((p) => ({ value: p.id, label: p.label }))}
          />

          <div>
            <Select
              label="Model"
              value={model?.id}
              onValueChange={setModelId}
              options={models.map((m) => ({ value: m.id, label: m.label }))}
            />
            {model && (
              <p className="mt-1.5 text-[13px] text-ink-muted">
                {model.note}
                {model.freePerDay !== null && (
                  <>
                    {" "}
                    <span className="text-ink-faint">
                      ({model.freePerDay.toLocaleString("en-IN")} free a day)
                    </span>
                  </>
                )}
              </p>
            )}
          </div>

          <div>
            <Input
              label="API key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={provider?.keyPlaceholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              error={
                keyLooksRight === false
                  ? `That doesn't look like a ${provider?.label} key`
                  : undefined
              }
              hint={
                configured
                  ? "Enter it again to change the model - we cannot read the stored one back"
                  : undefined
              }
            />

            {provider && (
              <a
                href={provider.keyUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1.5 inline-flex items-center gap-1 text-[13px] text-green underline underline-offset-2"
              >
                Get a {provider.label} key
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            )}
          </div>

          {/*
           * The honest version.
           *
           * "We can never read it" would be false - the server decrypts to
           * call the provider - and a security claim that is slightly false is
           * worse than none, because it is the one people rely on.
           */}
          <div className="rounded-[var(--radius-control)] border border-line bg-paper-sunken p-3.5">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
              <ShieldCheck className="size-4 text-green" aria-hidden="true" />
              How your key is handled
            </p>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-muted">
              <li>Encrypted before it is stored, and never written to logs.</li>
              <li>
                Never sent back - no screen and no API response can show it
                again, including to you. Only the last four characters.
              </li>
              <li>
                Used only to call the provider you chose, and nothing else.
              </li>
              <li>
                Being straight with you: the server has to decrypt it to make
                that call, so this protects against a leaked database or
                backup, not against someone who runs the server. If that
                matters to you, self-host - the source is public.
              </li>
            </ul>
          </div>

          <Button
            className="self-start"
            isLoading={save.isPending}
            disabled={!canSave}
            onClick={submit}
          >
            {configured ? "Replace my key" : "Use my key"}
          </Button>
        </div>
      )}
    </section>
  );
}
