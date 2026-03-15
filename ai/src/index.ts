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

// ── Plugin Export ──

export const aiModule: ModuleDefinition = {
  name: "ai",
  functions: { translate },
};

export const aiPlugin: AbstractLangPlugin = {
  name: "@abstractlang/plugin-ai",
  version: "0.1.0",
  modules: { ai: aiModule },
};

export default aiPlugin;
