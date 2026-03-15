import { readdir, readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import type {
  AbstractLangPlugin,
  ModuleDefinition,
  FunctionContract,
} from "abstractlang";

// ── Storage Helpers ──

const MEMORY_DIR = ".memory";

interface MemoryEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

function memoryDir(cwd: string): string {
  return resolve(cwd, MEMORY_DIR);
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

function generateId(): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const suffix = randomBytes(3).toString("hex");
  return `${timestamp}-${suffix}`;
}

async function readEntry(dir: string, filename: string): Promise<MemoryEntry | null> {
  try {
    const raw = await readFile(join(dir, filename), "utf-8");
    return JSON.parse(raw) as MemoryEntry;
  } catch {
    return null;
  }
}

async function listEntryFiles(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith(".json")).sort().reverse();
  } catch {
    return [];
  }
}

// ── Functions ──

const store: FunctionContract = {
  name: "store",
  description: "Store a piece of knowledge in the memory. Use this to remember facts, insights, or anything valuable for later.",
  input: {
    content: { type: "string", required: true, description: "The content to remember" },
    title: { type: "string", required: false, description: "Short title for this memory" },
    tags: { type: "array", items: { type: "string" }, required: false, description: "Tags for categorization and search" },
  },
  output: {
    type: "object",
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      path: { type: "file_path" },
    },
  },
  async execute(input, ctx) {
    const dir = memoryDir(ctx.cwd);
    await ensureDir(dir);

    const id = generateId();
    const title = (input.title as string) ?? id;
    const content = input.content as string;
    const tags = (input.tags as string[]) ?? [];

    const entry: MemoryEntry = {
      id,
      title,
      content,
      tags,
      createdAt: new Date().toISOString(),
    };

    const filePath = join(dir, `${id}.json`);
    await writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");

    return { id, title, tags, path: filePath };
  },
};

const search: FunctionContract = {
  name: "search",
  description: "Search the memory for stored knowledge. Matches against content, title, and tags.",
  input: {
    query: { type: "string", required: false, description: "Text to search for in content and titles" },
    tags: { type: "array", items: { type: "string" }, required: false, description: "Filter by tags (entries must match at least one)" },
  },
  output: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            snippet: { type: "string" },
            createdAt: { type: "string" },
          },
        },
      },
    },
  },
  async execute(input, ctx) {
    const dir = memoryDir(ctx.cwd);
    const files = await listEntryFiles(dir);
    const query = ((input.query as string) ?? "").toLowerCase();
    const filterTags = (input.tags as string[]) ?? [];

    type ScoredResult = {
      id: string;
      title: string;
      tags: string[];
      snippet: string;
      createdAt: string;
      score: number;
    };

    const results: ScoredResult[] = [];

    for (const file of files) {
      const entry = await readEntry(dir, file);
      if (!entry) continue;

      let score = 0;

      // Text matching — each query word scored independently
      if (query) {
        const words = query.split(/\s+/).filter(Boolean);
        const lowerContent = entry.content.toLowerCase();
        const lowerTitle = entry.title.toLowerCase();
        for (const word of words) {
          if (lowerTitle.includes(word)) score += 3;
          if (lowerContent.includes(word)) score += 1;
        }
      }

      // Tag matching
      if (filterTags.length > 0) {
        const matchingTags = filterTags.filter((t) =>
          entry.tags.some((et) => et.toLowerCase() === t.toLowerCase()),
        );
        score += matchingTags.length * 2;
      }

      // If no filters, include everything
      if (!query && filterTags.length === 0) {
        score = 1;
      }

      if (score > 0) {
        const snippet = entry.content.length > 150
          ? entry.content.slice(0, 150) + "..."
          : entry.content;

        results.push({
          id: entry.id,
          title: entry.title,
          tags: entry.tags,
          snippet,
          createdAt: entry.createdAt,
          score,
        });
      }
    }

    // Sort by score descending, then by date descending
    results.sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt));

    // Return without score field, limit to 20
    return {
      results: results.slice(0, 20).map(({ score: _, ...rest }) => rest),
    };
  },
};

const list: FunctionContract = {
  name: "list",
  description: "List all stored memories, newest first.",
  input: {
    limit: { type: "number", required: false, default: 20, description: "Maximum number of entries to return" },
  },
  output: {
    type: "object",
    properties: {
      entries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            createdAt: { type: "string" },
          },
        },
      },
    },
  },
  async execute(input, ctx) {
    const dir = memoryDir(ctx.cwd);
    const files = await listEntryFiles(dir);
    const limit = (input.limit as number) ?? 20;

    const entries: { id: string; title: string; tags: string[]; createdAt: string }[] = [];

    for (const file of files.slice(0, limit)) {
      const entry = await readEntry(dir, file);
      if (!entry) continue;
      entries.push({
        id: entry.id,
        title: entry.title,
        tags: entry.tags,
        createdAt: entry.createdAt,
      });
    }

    return { entries };
  },
};

const deleteEntry: FunctionContract = {
  name: "delete",
  description: "Delete a memory entry by its ID.",
  input: {
    id: { type: "string", required: true, description: "The ID of the memory entry to delete" },
  },
  output: {
    type: "object",
    properties: {
      deleted: { type: "boolean" },
    },
  },
  async execute(input, ctx) {
    const dir = memoryDir(ctx.cwd);
    const id = input.id as string;
    const filePath = join(dir, `${id}.json`);

    try {
      await unlink(filePath);
      return { deleted: true };
    } catch {
      return { deleted: false };
    }
  },
};

// ── Plugin Export ──

export const memoryModule: ModuleDefinition = {
  name: "memory",
  functions: { store, search, list, delete: deleteEntry },
};

export const memoryPlugin: AbstractLangPlugin = {
  name: "@abstractlang/plugin-memory",
  version: "0.1.0",
  modules: { memory: memoryModule },
};

export default memoryPlugin;
