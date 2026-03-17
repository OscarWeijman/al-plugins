import type {
  AbstractLangPlugin,
  FunctionContract,
  ModuleDefinition,
} from "abstractlang";
import * as cheerio from "cheerio";

/**
 * Parse a selector that may end with an attribute shorthand like `:href` or `:src`.
 * Examples:
 *   "article > h1 > a:href"  → { selector: "article > h1 > a", attr: "href" }
 *   "h1"                     → { selector: "h1", attr: null }
 *   "img:src"                → { selector: "img", attr: "src" }
 */
function parseSelector(raw: string): { selector: string; attr: string | null } {
  // Match trailing :word that isn't a CSS pseudo-class (those use parentheses or are known names)
  const pseudoClasses = new Set([
    "first-child", "last-child", "nth-child", "nth-of-type",
    "first-of-type", "last-of-type", "only-child", "only-of-type",
    "hover", "focus", "active", "visited", "link", "checked",
    "disabled", "enabled", "empty", "root", "not", "has",
    "is", "where", "any-link", "placeholder-shown",
  ]);

  const match = raw.match(/:([a-zA-Z][\w-]*)$/);
  if (match && !pseudoClasses.has(match[1])) {
    return {
      selector: raw.slice(0, match.index),
      attr: match[1],
    };
  }
  return { selector: raw, attr: null };
}

const extract: FunctionContract = {
  name: "extract",
  description:
    "Fetch a web page and extract content using a CSS selector. " +
    "Append :attrName to the selector to extract an attribute (e.g. 'a:href', 'img:src').",
  input: {
    url: { type: "string", required: true, description: "URL to fetch" },
    selector: {
      type: "string",
      required: true,
      description: "CSS selector, optionally ending with :attr (e.g. 'h1', 'a:href', 'meta[property=\"og:title\"]:content')",
    },
  },
  output: {
    type: "object",
    properties: {
      value: { type: "string" },
      values: { type: "array", items: { type: "string" } },
      url: { type: "string" },
    },
  },
  async execute(input) {
    const url = input.url as string;
    const rawSelector = input.selector as string;
    const { selector, attr } = parseSelector(rawSelector);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const values: string[] = [];
    $(selector).each((_i, el) => {
      const text = attr ? $(el).attr(attr) : $(el).text();
      if (text !== undefined && text !== null) {
        values.push(text.trim());
      }
    });

    return {
      value: values[0] ?? "",
      values,
      url,
    };
  },
};

export const scrapeModule: ModuleDefinition = {
  name: "scrape",
  functions: { extract },
};

export const scrapePlugin: AbstractLangPlugin = {
  name: "@abstractlang/plugin-scrape",
  version: "0.1.0",
  modules: { scrape: scrapeModule },
};

export default scrapePlugin;
