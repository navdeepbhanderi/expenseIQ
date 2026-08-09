import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  api,
  apiFetch,
  bootstrapSession,
  setAccessToken,
  setUnauthorizedHandler,
} from "./client";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function mockFetch(...responses: (() => Response | Promise<Response>)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let index = 0;

  const spy = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return next();
  });

  vi.stubGlobal("fetch", spy);
  return { calls, spy };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
  setUnauthorizedHandler(null);
});

describe("apiFetch", () => {
  it("attaches the bearer token", async () => {
    setAccessToken("tok-123");
    const { calls } = mockFetch(() => json({ ok: true }));

    await api.get("/health");

    expect(
      (calls[0]!.init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer tok-123");
  });

  it("omits the token for anonymous calls", async () => {
    setAccessToken("tok-123");
    const { calls } = mockFetch(() => json({ ok: true }));

    await apiFetch("/auth/login", { method: "POST", anonymous: true });

    expect(
      (calls[0]!.init.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });

  it("always sends credentials so the refresh cookie travels", async () => {
    const { calls } = mockFetch(() => json({ ok: true }));

    await api.get("/health");

    expect(calls[0]!.init.credentials).toBe("include");
  });

  it("drops empty query params rather than filtering by empty string", async () => {
    const { calls } = mockFetch(() => json({ ok: true }));

    await api.get("/transactions", {
      query: { search: "kirana", categoryId: undefined, accountId: "", limit: 25 },
    });

    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get("search")).toBe("kirana");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.has("categoryId")).toBe(false);
    expect(url.searchParams.has("accountId")).toBe(false);
  });

  it("returns undefined for 204 instead of throwing on an empty body", async () => {
    // The undo endpoint answers 204. Calling .json() on it throws.
    mockFetch(() => new Response(null, { status: 204 }));

    await expect(api.post("/review-queue/undo")).resolves.toBeUndefined();
  });
});

describe("error handling", () => {
  it("surfaces the envelope's message", async () => {
    mockFetch(() =>
      json(
        {
          statusCode: 409,
          error: "Conflict",
          message: "A record with these values already exists",
          requestId: "req-1",
        },
        409,
      ),
    );

    const error = await api.get("/x").catch((e: unknown) => e as ApiError);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).displayMessage).toBe(
      "A record with these values already exists",
    );
    expect((error as ApiError).envelope?.requestId).toBe("req-1");
  });

  it("joins the validation pipe's array of field errors", async () => {
    // Reporting one of three problems makes the user fix them one at a time.
    mockFetch(() =>
      json(
        {
          statusCode: 400,
          error: "Bad Request",
          message: ["email must be an email", "password is too short"],
        },
        400,
      ),
    );

    const error = (await api
      .post("/auth/signup")
      .catch((e: unknown) => e)) as ApiError;

    expect(error.displayMessage).toBe(
      "email must be an email. password is too short",
    );
  });

  it("still reports the status when the body is not JSON", async () => {
    // A proxy or crash can return HTML; failing to parse must not mask a 502.
    mockFetch(() => new Response("<html>502</html>", { status: 502 }));

    const error = (await api.get("/x").catch((e: unknown) => e)) as ApiError;

    expect(error.status).toBe(502);
    expect(error.envelope).toBeNull();
  });
});

describe("token refresh", () => {
  it("refreshes once on 401 and replays the original request", async () => {
    setAccessToken("stale");
    const { calls } = mockFetch(
      () => json({ statusCode: 401, error: "Unauthorized", message: "nope" }, 401),
      () => json({ accessToken: "fresh" }),
      () => json({ data: "ok" }),
    );

    await expect(api.get("/dashboard")).resolves.toEqual({ data: "ok" });

    expect(calls).toHaveLength(3);
    expect(calls[1]!.url).toContain("/auth/refresh");
    // The replay must carry the NEW token, not the stale one.
    expect(
      (calls[2]!.init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer fresh");
  });

  it("does not retry a second time when the fresh token also 401s", async () => {
    // A 401 after a fresh token is a real 401. Retrying would loop forever
    // against a revoked session.
    setAccessToken("stale");
    const { calls } = mockFetch(
      () => json({ statusCode: 401, error: "Unauthorized", message: "nope" }, 401),
      () => json({ accessToken: "fresh" }),
      () => json({ statusCode: 401, error: "Unauthorized", message: "nope" }, 401),
    );

    await expect(api.get("/dashboard")).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(3);
  });

  it("shares one refresh across concurrent 401s", async () => {
    /*
     * The reason single-flight exists. The backend rotates refresh tokens and
     * revokes the whole family on reuse, so five parallel refreshes would look
     * exactly like a stolen token being replayed — and log the user out.
     */
    setAccessToken("stale");

    let refreshCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init: RequestInit = {}) => {
        const href = String(url);

        if (href.includes("/auth/refresh")) {
          refreshCount += 1;
          await new Promise((r) => setTimeout(r, 10));
          return json({ accessToken: "fresh" });
        }

        const auth = (init.headers as Record<string, string>)?.Authorization;
        return auth === "Bearer fresh"
          ? json({ ok: true })
          : json({ statusCode: 401, error: "Unauthorized", message: "no" }, 401);
      }),
    );

    await Promise.all([
      api.get("/dashboard"),
      api.get("/transactions"),
      api.get("/accounts"),
      api.get("/review-queue"),
      api.get("/notifications"),
    ]);

    expect(refreshCount).toBe(1);
  });

  it("clears the token and calls the handler when refresh fails", async () => {
    setAccessToken("stale");
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    mockFetch(
      () => json({ statusCode: 401, error: "Unauthorized", message: "no" }, 401),
      () => json({ statusCode: 401, error: "Unauthorized", message: "no" }, 401),
    );

    await expect(api.get("/dashboard")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("does not attempt a refresh for anonymous requests", async () => {
    // A failed login is a wrong password, not an expired session.
    const { calls } = mockFetch(() =>
      json({ statusCode: 401, error: "Unauthorized", message: "bad creds" }, 401),
    );

    await expect(
      apiFetch("/auth/login", { method: "POST", anonymous: true }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(calls).toHaveLength(1);
  });
});

describe("bootstrapSession", () => {
  it("trades the httpOnly cookie for a new access token on load", async () => {
    const { calls } = mockFetch(() => json({ accessToken: "restored" }));

    await expect(bootstrapSession()).resolves.toBe("restored");
    expect(calls[0]!.url).toContain("/auth/refresh");
    expect(calls[0]!.init.credentials).toBe("include");
  });

  it("resolves null for a visitor with no cookie", async () => {
    mockFetch(() => json({ statusCode: 401, error: "Unauthorized", message: "" }, 401));

    await expect(bootstrapSession()).resolves.toBeNull();
  });
});
