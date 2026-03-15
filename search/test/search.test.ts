import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { searchPlugin } from "../src/index.js";
import type { ExecutionContext, FunctionRegistry } from "abstractlang";

const query = searchPlugin.modules.search.functions.query;
const extract = searchPlugin.modules.search.functions.extract;

function makeCtx(): ExecutionContext {
  return {
    params: {},
    results: {},
    functions: {} as FunctionRegistry,
    cwd: "/tmp",
  };
}

describe("search.query", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.TAVILY_API_KEY;

  beforeEach(() => {
    process.env.TAVILY_API_KEY = "test-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.TAVILY_API_KEY = originalEnv;
    } else {
      delete process.env.TAVILY_API_KEY;
    }
  });

  it("sends correct query and returns results", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            title: "Example Result",
            url: "https://example.com",
            content: "This is a test result",
            score: 0.95,
          },
        ],
      }),
    });

    const result = (await query.execute(
      { query: "test search" },
      makeCtx(),
    )) as { results: { title: string; url: string; content: string; score: number }[] };

    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("Example Result");
    expect(result.results[0].score).toBe(0.95);

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("https://api.tavily.com/search");
    const body = JSON.parse(call[1].body);
    expect(body.query).toBe("test search");
    expect(body.max_results).toBe(5);
    expect(body.topic).toBe("general");
    expect(call[1].headers.Authorization).toBe("Bearer test-key");
  });

  it("passes optional parameters", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: "News", url: "https://news.com", content: "Breaking", score: 0.9 },
        ],
      }),
    });

    await query.execute(
      { query: "latest news", max_results: 10, topic: "news", time_range: "week", include_answer: true },
      makeCtx(),
    );

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.max_results).toBe(10);
    expect(body.topic).toBe("news");
    expect(body.time_range).toBe("week");
    expect(body.include_answer).toBe(true);
  });

  it("includes answer when returned by API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: "Result", url: "https://example.com", content: "Content", score: 0.8 },
        ],
        answer: "The answer is 42",
      }),
    });

    const result = (await query.execute(
      { query: "meaning of life", include_answer: true },
      makeCtx(),
    )) as { results: unknown[]; answer?: string };

    expect(result.answer).toBe("The answer is 42");
  });

  it("throws on missing API key", async () => {
    delete process.env.TAVILY_API_KEY;

    await expect(
      query.execute({ query: "test" }, makeCtx()),
    ).rejects.toThrow("TAVILY_API_KEY");
  });

  it("throws on API error response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
    });

    await expect(
      query.execute({ query: "test" }, makeCtx()),
    ).rejects.toThrow("Tavily API error (429)");
  });

  it("returns empty results array when no matches", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const result = (await query.execute(
      { query: "obscure query" },
      makeCtx(),
    )) as { results: unknown[] };

    expect(result.results).toEqual([]);
  });

  it("omits time_range when not provided", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: "R", url: "https://r.com", content: "C", score: 0.5 },
        ],
      }),
    });

    await query.execute({ query: "test" }, makeCtx());

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.time_range).toBeUndefined();
  });
});

describe("search.extract", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.TAVILY_API_KEY;

  beforeEach(() => {
    process.env.TAVILY_API_KEY = "test-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.TAVILY_API_KEY = originalEnv;
    } else {
      delete process.env.TAVILY_API_KEY;
    }
  });

  it("extracts content from a single URL", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { url: "https://example.com", raw_content: "Page content here" },
        ],
      }),
    });

    const result = (await extract.execute(
      { urls: "https://example.com" },
      makeCtx(),
    )) as { results: { url: string; raw_content: string }[] };

    expect(result.results).toHaveLength(1);
    expect(result.results[0].raw_content).toBe("Page content here");

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("https://api.tavily.com/extract");
    const body = JSON.parse(call[1].body);
    expect(body.urls).toEqual(["https://example.com"]);
  });

  it("extracts content from an array of URLs", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { url: "https://a.com", raw_content: "A" },
          { url: "https://b.com", raw_content: "B" },
        ],
      }),
    });

    await extract.execute(
      { urls: ["https://a.com", "https://b.com"] },
      makeCtx(),
    );

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.urls).toEqual(["https://a.com", "https://b.com"]);
  });

  it("still accepts comma-separated string for backwards compatibility", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { url: "https://a.com", raw_content: "A" },
          { url: "https://b.com", raw_content: "B" },
        ],
      }),
    });

    await extract.execute(
      { urls: "https://a.com, https://b.com" },
      makeCtx(),
    );

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.urls).toEqual(["https://a.com", "https://b.com"]);
  });

  it("throws on missing API key", async () => {
    delete process.env.TAVILY_API_KEY;

    await expect(
      extract.execute({ urls: "https://example.com" }, makeCtx()),
    ).rejects.toThrow("TAVILY_API_KEY");
  });

  it("throws on API error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    await expect(
      extract.execute({ urls: "https://example.com" }, makeCtx()),
    ).rejects.toThrow("Tavily Extract API error (401)");
  });

  it("returns empty results array when no content extracted", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const result = (await extract.execute(
      { urls: ["https://example.com"] },
      makeCtx(),
    )) as { results: unknown[] };

    expect(result.results).toEqual([]);
  });
});

describe("searchPlugin structure", () => {
  it("has correct plugin metadata", () => {
    expect(searchPlugin.name).toBe("@abstractlang/plugin-search");
    expect(searchPlugin.version).toBe("0.1.0");
  });

  it("exports search module with query and extract functions", () => {
    expect(searchPlugin.modules.search).toBeDefined();
    expect(searchPlugin.modules.search.name).toBe("search");
    expect(searchPlugin.modules.search.functions.query).toBeDefined();
    expect(searchPlugin.modules.search.functions.query.name).toBe("query");
    expect(searchPlugin.modules.search.functions.extract).toBeDefined();
    expect(searchPlugin.modules.search.functions.extract.name).toBe("extract");
  });
});
