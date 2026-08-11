import { beforeEach, describe, expect, it, vi } from "vitest";
import { setAccessToken, setUnauthorizedHandler } from "./client";
import { downloadExport } from "./transactions";

/**
 * The CSV export used to build its own request, and got two things wrong that
 * only show up with a filter applied or an aged-out token — neither of which
 * a quick manual "does the button work" check would surface.
 */

function mockFetch(response: () => Response) {
  const calls: { url: string }[] = [];
  const spy = vi.fn(async (url: string | URL) => {
    calls.push({ url: String(url) });
    return response();
  });
  vi.stubGlobal("fetch", spy);
  return { calls };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  setAccessToken("tok-123");
  setUnauthorizedHandler(null);

  // jsdom has neither of these, and the export touches both.
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined }));
  HTMLAnchorElement.prototype.click = vi.fn();
});

const csv = () =>
  new Response("date,amount\n2026-08-01,300", {
    status: 200,
    headers: { "Content-Type": "text/csv; charset=utf-8" },
  });

describe("downloadExport", () => {
  it("carries array filters in a form the API accepts", async () => {
    const { calls } = mockFetch(csv);

    await downloadExport("p1", {
      categoryIds: ["cat-a", "cat-b"],
      accountIds: ["acc-1"],
    });

    const url = new URL(calls[0]!.url);

    /*
     * The server's toStringArray takes both `?ids=a&ids=b` and `?ids=a,b`, so
     * either encoding is correct — what matters is that the ids reach the
     * request at all. An export that quietly ignored the filters would look
     * fine on screen and hand back the whole ledger.
     */
    expect(url.searchParams.get("categoryIds")).toBe("cat-a,cat-b");
    expect(url.searchParams.get("accountIds")).toBe("acc-1");
  });

  it("carries the scalar filters through", async () => {
    const { calls } = mockFetch(csv);

    await downloadExport("p1", {
      q: "swiggy",
      from: "2026-08-01",
      to: "2026-08-31",
      direction: "DEBIT",
    });

    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get("q")).toBe("swiggy");
    expect(url.searchParams.get("from")).toBe("2026-08-01");
    expect(url.searchParams.get("to")).toBe("2026-08-31");
    expect(url.searchParams.get("direction")).toBe("DEBIT");
  });

  it("sends the bearer token", async () => {
    const seen: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL, init: RequestInit = {}) => {
        seen.push(init);
        return csv();
      }),
    );

    await downloadExport("p1", {});

    // Going through the shared client is what gets the token attached — and
    // what makes a 401 refresh and retry rather than simply fail.
    expect(new Headers(seen[0]!.headers).get("Authorization")).toBe(
      "Bearer tok-123",
    );
  });

  it("does not parse the CSV body as JSON", async () => {
    mockFetch(csv);

    // JSON.parse on "date,amount…" throws; the raw path is what makes a
    // non-JSON endpoint usable through the same client at all.
    await expect(downloadExport("p1", {})).resolves.toBeUndefined();
  });
});
