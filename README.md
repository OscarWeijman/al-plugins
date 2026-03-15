# al-plugins

AbstractLang plugins that extend the function registry with domain-specific capabilities. Each plugin follows the `AbstractLangPlugin → ModuleDefinition → FunctionContract` pattern.

## Plugins

### plugin-ai

LLM-powered text operations via OpenRouter.

| Function | Description |
|---|---|
| `ai.translate` | Translate text to another language using Claude Haiku 4.5 |

Requires `OPENROUTER_API_KEY`.

### plugin-memory

Persistent knowledge base for agents — store, search, and manage memories.

| Function | Description |
|---|---|
| `memory.store` | Store knowledge with optional title and tags |
| `memory.search` | Search by text query and/or tags with relevance scoring |
| `memory.list` | List all stored memories (newest first) |
| `memory.delete` | Delete a memory entry by ID |

Memories are persisted as JSON files in a `.memory` directory.

### plugin-search

Web search and content extraction via Tavily.

| Function | Description |
|---|---|
| `search.query` | Search the web with structured results (title, URL, content, score) |
| `search.extract` | Extract clean content from one or more web pages |

Requires `TAVILY_API_KEY`.

## Usage

Plugins are registered in the agent runtime:

```typescript
import { createDefaultRegistry, loadPlugin } from "abstractlang";
import { aiPlugin } from "@abstractlang/plugin-ai";
import { memoryPlugin } from "@abstractlang/plugin-memory";
import { searchPlugin } from "@abstractlang/plugin-search";

const registry = createDefaultRegistry();
loadPlugin(aiPlugin, registry);
loadPlugin(memoryPlugin, registry);
loadPlugin(searchPlugin, registry);
```

Once loaded, functions are available in workflows as `module.function` (e.g. `search.query`, `memory.store`).

## Development

Each plugin has its own `package.json` and test suite:

```bash
cd ai && npm install && npm test
cd memory && npm install && npm test
cd search && npm install && npm test
```

39 tests across all plugins.
