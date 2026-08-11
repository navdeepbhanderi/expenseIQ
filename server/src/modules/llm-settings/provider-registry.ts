/**
 * The providers and models a user may choose.
 *
 * A closed list rather than free text, for two reasons that both matter.
 *
 * A typo'd model id fails at parse time, several seconds after the user
 * pressed save, with a provider error they cannot act on — whereas rejecting
 * it at save time says exactly what is wrong while they are still looking at
 * the form. And a free-text endpoint would let anyone point the server at an
 * arbitrary URL, which turns a settings field into server-side request
 * forgery: the host is fixed per provider here and never comes from input.
 *
 * The daily limits are the free-tier figures as published, and they are shown
 * in the UI because they are the single most useful thing to know when
 * choosing. They are advisory — providers change them — so nothing in the code
 * enforces or depends on them.
 *
 * **Every model here must support JSON-schema structured output.** Extraction
 * asks for a schema-constrained response, and a model without it fails on
 * every call, not intermittently. Groq's llama-3.3-70b-versatile was listed
 * here until a live call returned "This model does not support response
 * format `json_schema`" — offering a model that cannot work is worse than
 * offering fewer, because the failure only appears at parse time.
 */

export interface ProviderModel {
  id: string;
  label: string;
  /** Free-tier requests per day, as published. Null when there is no free tier. */
  freePerDay: number | null;
  /** Shown under the model, e.g. "fast, good enough for parsing". */
  note: string;
  /** Whether it can read a receipt image. */
  vision: boolean;
}

export interface ProviderDefinition {
  id: string;
  label: string;
  /** Where the user gets a key. Shown as a link. */
  keyUrl: string;
  /** What the key looks like, so a wrong paste is obvious before saving. */
  keyPattern: RegExp;
  keyPlaceholder: string;
  models: ProviderModel[];
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'groq',
    label: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    keyPattern: /^gsk_[A-Za-z0-9]{20,}$/,
    keyPlaceholder: 'gsk_…',
    models: [
      {
        id: 'llama-3.1-8b-instant',
        label: 'Llama 3.1 8B Instant',
        freePerDay: 14_400,
        note: 'Fast, and the most generous free tier here. What the platform uses.',
        vision: false,
      },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    keyPattern: /^sk-or-v1-[A-Za-z0-9]{20,}$/,
    keyPlaceholder: 'sk-or-v1-…',
    models: [
      {
        id: 'google/gemma-3-27b-it:free',
        label: 'Gemma 3 27B',
        freePerDay: 50,
        note: 'Free tier is 50 a day per account, 1000 once you have ever bought credits.',
        vision: false,
      },
      {
        id: 'meta-llama/llama-3.2-11b-vision-instruct:free',
        label: 'Llama 3.2 11B Vision',
        freePerDay: 50,
        note: 'Reads receipt images as well as text.',
        vision: true,
      },
    ],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPattern: /^AIza[A-Za-z0-9_-]{30,}$/,
    keyPlaceholder: 'AIza…',
    models: [
      {
        id: 'gemini-2.0-flash',
        label: 'Gemini 2.0 Flash',
        freePerDay: 200,
        note: 'Handles text, audio and images. The only one here that takes audio.',
        vision: true,
      },
    ],
  },
];

export function findProvider(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

export function isKnownModel(providerId: string, modelId: string): boolean {
  return Boolean(
    findProvider(providerId)?.models.some((model) => model.id === modelId),
  );
}

/**
 * The registry as the browser needs it.
 *
 * `keyPattern` is sent as a string because a RegExp does not survive JSON, and
 * the client re-compiles it to validate before saving — a wrong-looking key
 * caught in the form beats one caught by the provider ten seconds later.
 */
export function publicRegistry() {
  return PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    keyUrl: provider.keyUrl,
    keyPattern: provider.keyPattern.source,
    keyPlaceholder: provider.keyPlaceholder,
    models: provider.models,
  }));
}
