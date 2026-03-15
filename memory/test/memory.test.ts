import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { memoryModule, memoryPlugin } from "../src/index.js";
import type { ExecutionContext, FunctionRegistry } from "abstractlang";

function makeCtx(cwd: string): ExecutionContext {
  return {
    params: {},
    results: {},
    functions: undefined as unknown as FunctionRegistry,
    cwd,
  };
}

describe("memory plugin", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "memory-test-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("exports a valid AbstractLangPlugin", () => {
    expect(memoryPlugin.name).toBe("@abstractlang/plugin-memory");
    expect(memoryPlugin.modules.memory).toBeDefined();
    expect(Object.keys(memoryPlugin.modules.memory.functions)).toEqual(
      expect.arrayContaining(["store", "search", "list", "delete"]),
    );
  });

  it("exports a valid ModuleDefinition", () => {
    expect(memoryModule.name).toBe("memory");
    for (const fn of Object.values(memoryModule.functions)) {
      expect(fn.name).toBeTruthy();
      expect(fn.description).toBeTruthy();
      expect(fn.input).toBeDefined();
      expect(fn.output).toBeDefined();
      expect(fn.execute).toBeTypeOf("function");
    }
  });

  describe("memory.store", () => {
    const store = memoryModule.functions.store;

    it("stores a memory entry and returns id", async () => {
      const result = (await store.execute(
        { content: "Hello world", title: "Test", tags: ["test"] },
        makeCtx(cwd),
      )) as { id: string; title: string; tags: string[]; path: string };

      expect(result.id).toMatch(/^\d+-[a-f0-9]{6}$/);
      expect(result.title).toBe("Test");
      expect(result.tags).toEqual(["test"]);
      expect(result.path).toContain(".memory");
    });

    it("creates .memory directory and JSON file", async () => {
      const result = (await store.execute(
        { content: "Some knowledge" },
        makeCtx(cwd),
      )) as { id: string };

      const files = await readdir(join(cwd, ".memory"));
      expect(files).toContain(`${result.id}.json`);

      const raw = await readFile(join(cwd, ".memory", `${result.id}.json`), "utf-8");
      const entry = JSON.parse(raw);
      expect(entry.content).toBe("Some knowledge");
      expect(entry.createdAt).toBeTruthy();
    });

    it("uses id as title when not provided", async () => {
      const result = (await store.execute(
        { content: "No title" },
        makeCtx(cwd),
      )) as { id: string; title: string };

      expect(result.title).toBe(result.id);
    });
  });

  describe("memory.search", () => {
    const store = memoryModule.functions.store;
    const search = memoryModule.functions.search;

    it("finds entries by query text in content", async () => {
      await store.execute({ content: "TypeScript is great", title: "TS", tags: ["lang"] }, makeCtx(cwd));
      await store.execute({ content: "Python is versatile", title: "Py", tags: ["lang"] }, makeCtx(cwd));

      const result = (await search.execute({ query: "TypeScript" }, makeCtx(cwd))) as {
        results: { title: string }[];
      };

      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe("TS");
    });

    it("finds entries by query text in title", async () => {
      await store.execute({ content: "Some info", title: "API rate limits" }, makeCtx(cwd));

      const result = (await search.execute({ query: "rate limits" }, makeCtx(cwd))) as {
        results: { title: string }[];
      };

      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe("API rate limits");
    });

    it("finds entries when query words appear separately in content", async () => {
      await store.execute(
        { content: "De OpenRouter API heeft een rate limit van 60 req/min", title: "OpenRouter Rate Limit" },
        makeCtx(cwd),
      );

      const result = (await search.execute({ query: "API limit" }, makeCtx(cwd))) as {
        results: { title: string }[];
      };

      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe("OpenRouter Rate Limit");
    });

    it("finds entries by tags", async () => {
      await store.execute({ content: "A", title: "A", tags: ["api"] }, makeCtx(cwd));
      await store.execute({ content: "B", title: "B", tags: ["database"] }, makeCtx(cwd));

      const result = (await search.execute({ tags: ["api"] }, makeCtx(cwd))) as {
        results: { title: string }[];
      };

      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe("A");
    });

    it("returns all entries when no filters", async () => {
      await store.execute({ content: "A" }, makeCtx(cwd));
      await store.execute({ content: "B" }, makeCtx(cwd));

      const result = (await search.execute({}, makeCtx(cwd))) as {
        results: unknown[];
      };

      expect(result.results).toHaveLength(2);
    });

    it("returns empty for no matches", async () => {
      await store.execute({ content: "Hello" }, makeCtx(cwd));

      const result = (await search.execute({ query: "nonexistent" }, makeCtx(cwd))) as {
        results: unknown[];
      };

      expect(result.results).toHaveLength(0);
    });

    it("truncates long content to snippet", async () => {
      const longContent = "x".repeat(300);
      await store.execute({ content: longContent, title: "Long" }, makeCtx(cwd));

      const result = (await search.execute({}, makeCtx(cwd))) as {
        results: { snippet: string }[];
      };

      expect(result.results[0].snippet.length).toBeLessThanOrEqual(153); // 150 + "..."
    });
  });

  describe("memory.list", () => {
    const store = memoryModule.functions.store;
    const list = memoryModule.functions.list;

    it("lists entries newest first", async () => {
      await store.execute({ content: "First", title: "First" }, makeCtx(cwd));
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      await store.execute({ content: "Second", title: "Second" }, makeCtx(cwd));

      const result = (await list.execute({}, makeCtx(cwd))) as {
        entries: { title: string }[];
      };

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].title).toBe("Second");
      expect(result.entries[1].title).toBe("First");
    });

    it("respects limit", async () => {
      await store.execute({ content: "A" }, makeCtx(cwd));
      await store.execute({ content: "B" }, makeCtx(cwd));
      await store.execute({ content: "C" }, makeCtx(cwd));

      const result = (await list.execute({ limit: 2 }, makeCtx(cwd))) as {
        entries: unknown[];
      };

      expect(result.entries).toHaveLength(2);
    });

    it("returns empty for no entries", async () => {
      const result = (await list.execute({}, makeCtx(cwd))) as {
        entries: unknown[];
      };

      expect(result.entries).toHaveLength(0);
    });
  });

  describe("memory.delete", () => {
    const store = memoryModule.functions.store;
    const del = memoryModule.functions.delete;
    const list = memoryModule.functions.list;

    it("deletes an existing entry", async () => {
      const stored = (await store.execute({ content: "To delete" }, makeCtx(cwd))) as { id: string };
      const result = (await del.execute({ id: stored.id }, makeCtx(cwd))) as { deleted: boolean };

      expect(result.deleted).toBe(true);

      const remaining = (await list.execute({}, makeCtx(cwd))) as { entries: unknown[] };
      expect(remaining.entries).toHaveLength(0);
    });

    it("returns false for non-existent entry", async () => {
      const result = (await del.execute({ id: "nonexistent" }, makeCtx(cwd))) as { deleted: boolean };
      expect(result.deleted).toBe(false);
    });
  });
});
