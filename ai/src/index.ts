import type {
  AbstractLangPlugin,
  ModuleDefinition,
  FunctionContract,
} from "abstractlang";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

const translate: FunctionContract = {
  name: "translate",
  description:
    "Translate plain text to another language using an LLM via OpenRouter.",
  input: {
    content: {
      type: "string",
      required: true,
      description: "The text to translate",
    },
    lang: {
      type: "string",
      required: true,
      description: "Target language (e.g. 'nl', 'Dutch', 'fr', 'German')",
    },
  },
  output: {
    type: "object",
    properties: {
      content: { type: "string" },
    },
  },
  async execute(input) {
    const content = input.content as string;
    const lang = input.lang as string;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY environment variable is required for ai.translate",
      );
    }

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "user",
            content: `Translate the following text to ${lang}. Return only the translation, no explanation.\n\n${content}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenRouter API error (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const translated = data.choices?.[0]?.message?.content;
    if (!translated) {
      throw new Error("OpenRouter returned an empty response");
    }

    return { content: translated.trim() };
  },
};

// ── ai.summarize ──

const LENGTH_INSTRUCTIONS: Record<string, string> = {
  short: "in 1-2 sentences",
  medium: "in a concise paragraph",
  long: "in 2-3 paragraphs",
};

const summarize: FunctionContract = {
  name: "summarize",
  description:
    "Summarize text using an LLM via OpenRouter. Supports short, medium, or long summaries.",
  input: {
    content: {
      type: "string",
      required: true,
      description: "The text to summarize",
    },
    max_length: {
      type: "string",
      required: false,
      description: "Summary length: short, medium, or long (default: medium)",
    },
  },
  output: {
    type: "object",
    properties: {
      content: { type: "string" },
    },
  },
  async execute(input) {
    const content = input.content as string;
    const maxLength = (input.max_length as string) ?? "medium";
    const lengthInstruction = LENGTH_INSTRUCTIONS[maxLength] ?? LENGTH_INSTRUCTIONS.medium;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY environment variable is required for ai.summarize",
      );
    }

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "user",
            content: `Summarize the following text ${lengthInstruction}. Return only the summary, no preamble or explanation.\n\n${content}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenRouter API error (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const summary = data.choices?.[0]?.message?.content;
    if (!summary) {
      throw new Error("OpenRouter returned an empty response");
    }

    return { content: summary.trim() };
  },
};

// ── Plugin Export ──

export const aiModule: ModuleDefinition = {
  name: "ai",
  functions: { translate, summarize },
};

export const aiPlugin: AbstractLangPlugin = {
  name: "@abstractlang/plugin-ai",
  version: "0.1.0",
  modules: { ai: aiModule },
};

export default aiPlugin;
