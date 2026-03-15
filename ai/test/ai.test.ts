import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { aiPlugin } from "../src/index.js";
import type { ExecutionContext, FunctionRegistry } from "abstractlang";

const translate = aiPlugin.modules.ai.functions.translate;
const summarize = aiPlugin.modules.ai.functions.summarize;

function makeCtx(): ExecutionContext {
  return {
    params: {},
    results: {},
    functions: {} as FunctionRegistry,
    cwd: "/tmp",
  };
}

describe("ai.translate", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.OPENROUTER_API_KEY = originalEnv;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  it("sends correct prompt and returns translation", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hallo wereld" } }],
      }),
    });

    const result = (await translate.execute(
      { content: "Hello world", lang: "Dutch" },
      makeCtx(),
    )) as { content: string };

    expect(result.content).toBe("Hallo wereld");

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.messages[0].content).toContain("Hello world");
    expect(body.messages[0].content).toContain("Dutch");
    expect(call[1].headers.Authorization).toBe("Bearer test-key");
  });

  it("trims whitespace from translation", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "  Hallo wereld  \n" } }],
      }),
    });

    const result = (await translate.execute(
      { content: "Hello world", lang: "nl" },
      makeCtx(),
    )) as { content: string };

    expect(result.content).toBe("Hallo wereld");
  });

  it("throws on missing API key", async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(
      translate.execute({ content: "Hello", lang: "nl" }, makeCtx()),
    ).rejects.toThrow("OPENROUTER_API_KEY");
  });

  it("throws on API error response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
    });

    await expect(
      translate.execute({ content: "Hello", lang: "nl" }, makeCtx()),
    ).rejects.toThrow("OpenRouter API error (429)");
  });

  it("throws on empty response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    });

    await expect(
      translate.execute({ content: "Hello", lang: "nl" }, makeCtx()),
    ).rejects.toThrow("empty response");
  });
});

describe("ai.summarize", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.OPENROUTER_API_KEY = originalEnv;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  it("sends correct prompt and returns summary", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "This is a summary." } }],
      }),
    });

    const result = (await summarize.execute(
      { content: "A very long article about AI and its impact on society..." },
      makeCtx(),
    )) as { content: string };

    expect(result.content).toBe("This is a summary.");

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.messages[0].content).toContain("long article about AI");
    expect(body.messages[0].content).toContain("concise paragraph");
  });

  it("respects max_length=short", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Short summary." } }],
      }),
    });

    await summarize.execute(
      { content: "Some text", max_length: "short" },
      makeCtx(),
    );

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.messages[0].content).toContain("1-2 sentences");
  });

  it("respects max_length=long", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Long summary." } }],
      }),
    });

    await summarize.execute(
      { content: "Some text", max_length: "long" },
      makeCtx(),
    );

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.messages[0].content).toContain("2-3 paragraphs");
  });

  it("defaults to medium when max_length omitted", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Medium summary." } }],
      }),
    });

    await summarize.execute({ content: "Some text" }, makeCtx());

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.messages[0].content).toContain("concise paragraph");
  });

  it("throws on missing API key", async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(
      summarize.execute({ content: "Hello" }, makeCtx()),
    ).rejects.toThrow("OPENROUTER_API_KEY");
  });

  it("throws on API error response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
    });

    await expect(
      summarize.execute({ content: "Hello" }, makeCtx()),
    ).rejects.toThrow("OpenRouter API error (429)");
  });

  it("throws on empty response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    });

    await expect(
      summarize.execute({ content: "Hello" }, makeCtx()),
    ).rejects.toThrow("empty response");
  });
});

describe("aiPlugin structure", () => {
  it("has correct plugin metadata", () => {
    expect(aiPlugin.name).toBe("@abstractlang/plugin-ai");
    expect(aiPlugin.version).toBe("0.1.0");
  });

  it("exports ai module with translate and summarize functions", () => {
    expect(aiPlugin.modules.ai).toBeDefined();
    expect(aiPlugin.modules.ai.name).toBe("ai");
    expect(aiPlugin.modules.ai.functions.translate).toBeDefined();
    expect(aiPlugin.modules.ai.functions.translate.name).toBe("translate");
    expect(aiPlugin.modules.ai.functions.summarize).toBeDefined();
    expect(aiPlugin.modules.ai.functions.summarize.name).toBe("summarize");
  });
});
