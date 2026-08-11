/**
 * The single door to the backend.
 *
 * Everything the app knows about talking to the API lives here: the base URL,
 * the access token, the refresh dance, and the error envelope. No component
 * calls `fetch` directly — otherwise the refresh logic has to be remembered in
 * every call site, and it will not be.
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3100/api/v1";

/** The error envelope every endpoint returns — see http-exception.filter.ts. */
export interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId?: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly envelope: ErrorEnvelope | null,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /**
   * The message worth showing a user.
   *
   * The validation pipe returns `message` as an array of field errors; most
   * other layers return a string. Joining rather than picking [0] because a
   * form that reports one of three problems makes the user fix them one at a
   * time.
   */
  get displayMessage(): string {
    const message = this.envelope?.message;
    if (Array.isArray(message)) return message.join(". ");
    return message ?? this.message;
  }

  /** True when the caller should send the user to log in again. */
  get isAuthError(): boolean {
    return this.status === 401;
  }
}

/*
 * The access token lives in a module variable, deliberately not localStorage.
 *
 * localStorage is readable by any script that gets injected into the page, so
 * a single XSS becomes a stolen session that outlives the tab. In memory, the
 * token dies with the tab, and the httpOnly refresh cookie — which JavaScript
 * cannot read at all — is what survives a reload. Losing the token on refresh
 * is not a bug here; it is the point, and `bootstrapSession` covers it.
 */
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Lets the auth provider redirect to /login when the refresh chain fails. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/*
 * Single-flight refresh.
 *
 * When a page mounts, several queries fire at once. If the token has expired
 * they all 401 together, and without this every one of them would POST
 * /auth/refresh. The backend rotates refresh tokens and revokes the whole
 * family on reuse, so a stampede would look exactly like a stolen token being
 * replayed — and log the user out. They share one in-flight refresh instead.
 */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        // The refresh token is an httpOnly cookie; without this it is not sent.
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) return null;

      const body = (await response.json()) as { accessToken?: string };
      accessToken = body.accessToken ?? null;
      return accessToken;
    } catch {
      return null;
    } finally {
      // Cleared in a microtask so callers awaiting this promise all observe
      // the same result before a fresh attempt can start.
      queueMicrotask(() => {
        refreshInFlight = null;
      });
    }
  })();

  return refreshInFlight;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Skips the auth header. Used by login/signup, which have no token yet. */
  anonymous?: boolean;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Returns the response body as text instead of parsing it as JSON. */
  raw?: boolean;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(
    path.startsWith("http") ? path : `${API_BASE}${path}`,
  );

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      // Undefined and null mean "no filter", not "filter by empty".
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

async function toApiError(response: Response): Promise<ApiError> {
  let envelope: ErrorEnvelope | null = null;

  try {
    envelope = (await response.json()) as ErrorEnvelope;
  } catch {
    // A proxy or a crash can return HTML or nothing at all. The status is
    // still meaningful, so failing to parse must not mask it.
  }

  const message = Array.isArray(envelope?.message)
    ? envelope.message.join(". ")
    : (envelope?.message ?? response.statusText ?? "Request failed");

  return new ApiError(response.status, envelope, message);
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, anonymous, query, headers, ...rest } = options;

  const send = async (token: string | null): Promise<Response> =>
    fetch(buildUrl(path, query), {
      ...rest,
      credentials: "include",
      headers: {
        ...(body !== undefined && !(body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(token && !anonymous ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });

  let response = await send(accessToken);

  // One retry, and only one. A 401 after a fresh token is a real 401 —
  // retrying again would loop forever against a revoked session.
  if (response.status === 401 && !anonymous) {
    const token = await refreshAccessToken();

    if (token) {
      response = await send(token);
    } else {
      accessToken = null;
      onUnauthorized?.();
    }
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  // 204 on delete/undo, and any empty body — .json() would throw on these.
  if (
    response.status === 204 ||
    response.headers.get("content-length") === "0"
  ) {
    return undefined as T;
  }

  const text = await response.text();

  /*
   * CSV export answers text/csv, and JSON.parse would throw on it.
   *
   * Opt-in rather than sniffing the content type: a caller asking for text
   * knows it is asking for text, and an endpoint that unexpectedly returns
   * HTML (a proxy error page, say) should still fail loudly here rather than
   * be handed back as if it were the payload.
   */
  if (options?.raw) return text as T;

  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "GET" }),
  /** GET returning the body verbatim — for CSV and anything else not JSON. */
  getText: (path: string, options?: RequestOptions) =>
    apiFetch<string>(path, { ...options, method: "GET", raw: true }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "PUT", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
};

/**
 * Recovers a session on page load.
 *
 * The access token is gone after a refresh (it only ever lived in memory), but
 * the httpOnly refresh cookie is not. This trades it for a new access token,
 * which is what makes "stay logged in across reloads" work without ever
 * putting a token somewhere a script could read it.
 */
export async function bootstrapSession(): Promise<string | null> {
  return refreshAccessToken();
}
