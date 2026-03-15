import type {
  AbstractLangPlugin,
  ModuleDefinition,
  FunctionContract,
} from "abstractlang";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";

function getApiKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    throw new Error(
      "TAVILY_API_KEY environment variable is required for search plugin",
    );
  }
  return key;
}

// ── search.query ──

const query: FunctionContract = {
  name: "query",
  description:
    "Search the web using Tavily and return structured results with titles, URLs, content snippets, and relevance scores.",
  input: {
    query: {
      type: "string",
      required: true,
      description: "The search query to execute",
    },
    max_results: {
      type: "number",
      required: false,
      description: "Maximum number of results (1-20, default: 5)",
    },
    topic: {
      type: "string",
      required: false,
      description: "Search topic: general, news, or finance (default: general)",
    },
    time_range: {
      type: "string",
      required: false,
      description:
        "Filter by time range: day, week, month, or year (default: no filter)",
    },
    include_answer: {
      type: "boolean",
      required: false,
      description:
        "Include an LLM-generated answer summarizing the results (default: false)",
    },
  },
  output: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            content: { type: "string" },
            score: { type: "number" },
          },
        },
      },
      answer: { type: "string" },
    },
  },
  async execute(input) {
    const apiKey = getApiKey();
    const searchQuery = input.query as string;
    const maxResults = (input.max_results as number) ?? 5;
    const topic = (input.topic as string) ?? "general";
    const timeRange = input.time_range as string | undefined;
    const includeAnswer = (input.include_answer as boolean) ?? false;

    const body: Record<string, unknown> = {
      query: searchQuery,
      max_results: maxResults,
      topic,
      include_answer: includeAnswer,
    };

    if (timeRange) {
      body.time_range = timeRange;
    }

    const response = await fetch(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tavily API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      results: { title: string; url: string; content: string; score: number }[];
      answer?: string;
    };

    const results = (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
    }));

    const output: Record<string, unknown> = { results };
    if (data.answer) {
      output.answer = data.answer;
    }

    return output;
  },
};

// ── search.extract ──

const extract: FunctionContract = {
  name: "extract",
  description:
    "Extract clean content from one or more web pages using Tavily.",
  input: {
    urls: {
      type: "array",
      required: true,
      description:
        "URL or array of URLs to extract content from (also accepts a single string)",
    },
  },
  output: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: { type: "string" },
            raw_content: { type: "string" },
          },
        },
      },
    },
  },
  async execute(input) {
    const apiKey = getApiKey();
    const rawUrls = input.urls;
    let urls: string[];

    if (Array.isArray(rawUrls)) {
      urls = rawUrls.map((u: string) => String(u).trim()).filter(Boolean);
    } else if (typeof rawUrls === "string" && rawUrls.trim()) {
      urls = rawUrls.includes(",")
        ? rawUrls.split(",").map((u) => u.trim()).filter(Boolean)
        : [rawUrls.trim()];
    } else {
      throw new Error("urls must be a non-empty array or string");
    }

    if (urls.length === 0) {
      throw new Error("urls must contain at least one valid URL");
    }

    const response = await fetch(TAVILY_EXTRACT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ urls }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tavily Extract API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      results: { url: string; raw_content: string }[];
    };

    const results = (data.results ?? []).map((r) => ({
      url: r.url,
      raw_content: r.raw_content,
    }));

    return { results };
  },
};

// ── Plugin Export ──

export const searchModule: ModuleDefinition = {
  name: "search",
  functions: { query, extract },
};

export const searchPlugin: AbstractLangPlugin = {
  name: "@abstractlang/plugin-search",
  version: "0.1.0",
  modules: { search: searchModule },
};

export default searchPlugin;
