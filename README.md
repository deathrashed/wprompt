<div align="center">
  <h1 align="center">SEND-PROMPT</h1>

  <p align="center"><strong>Dispatch prompts to 20 AI platforms from a single CLI.</strong></p>

  <p align="center">
    <a href="#quick-start"><img src="https://img.shields.io/badge/Quick%20Start-1e1e1e?style=for-the-badge&logo=terminal&logoColor=%2301acd7" alt="Quick Start"></a>
    <a href="#providers"><img src="https://img.shields.io/badge/20%20Providers-1e1e1e?style=for-the-badge&logo=microsoftazure&logoColor=%2301acd7" alt="Providers"></a>
    <a href="#usage"><img src="https://img.shields.io/badge/CLI-1e1e1e?style=for-the-badge&logo=gnubash&logoColor=%2301acd7" alt="CLI"></a>
    <a href="#structure"><img src="https://img.shields.io/badge/Structure-1e1e1e?style=for-the-badge&logo=codefile&logoColor=%2301acd7" alt="Structure"></a>
  </p>

  <p align="center">
    <a href="#quick-start">Quick Start</a> |
    <a href="#providers">Providers</a> |
    <a href="#usage">Usage</a> |
    <a href="#structure">Structure</a> |
    <a href="#requirements">Requirements</a> |
    <a href="#details">Details</a>
  </p>

</div>

---

## <img src="https://api.iconify.design/mdi:rocket-launch-outline.svg?color=%2301acd7" height="22"> Quick Start

```bash
# Send a prompt to a single provider
./wprompt "Explain quantum computing in 3 sentences" -p claude

# Send to multiple providers at once
./wprompt "Compare React vs Vue" -p chatgpt,gemini,perplexity

# Broadcast to all 20 supported platforms
./wprompt "Write a quick Python HTTP server" --all
```

> [!TIP]
> Run `./wprompt --list` to see all supported providers and their aliases.

---

## <img src="https://api.iconify.design/mdi:puzzle-outline.svg?color=%2301acd7" height="22"> Providers

| Provider | Description | Script |
| --- | --- | --- |
| <img src="https://api.iconify.design/mdi:chat-bubble-outline.svg?color=%2301acd7" height="16"> **ChatGPT** | OpenAI ChatGPT | `prompt-chatgpt.js` |
| <img src="https://api.iconify.design/mdi:robot-outline.svg?color=%2301acd7" height="16"> **Claude** | Anthropic Claude | `prompt-claude.js` |
| <img src="https://api.iconify.design/mdi:sparkles.svg?color=%2301acd7" height="16"> **Gemini** | Google Gemini | `prompt-gemini.js` |
| <img src="https://api.iconify.design/mdi:magnify.svg?color=%2301acd7" height="16"> **Brave AI** | Brave AI Search | `prompt-brave-ai.js` |
| <img src="https://api.iconify.design/mdi:brain.svg?color=%2301acd7" height="16"> **DeepSeek** | DeepSeek Chat | `prompt-deepseek.js` |
| <img src="https://api.iconify.design/mdi:source-branch.svg?color=%2301acd7" height="16"> **Copilot** | Microsoft Copilot | `prompt-copilot.js` |
| <img src="https://api.iconify.design/mdi:search-web.svg?color=%2301acd7" height="16"> **DuckDuckGo** | DuckDuckGo AI Chat | `prompt-ddg.js` |
| <img src="https://api.iconify.design/mdi:eye-outline.svg?color=%2301acd7" height="16"> **Perplexity** | Perplexity AI | `prompt-perplexity.js` |
| <img src="https://api.iconify.design/mdi:chat.svg?color=%2301acd7" height="16"> **Grok** | xAI Grok | `prompt-grok.js` |
| <img src="https://api.iconify.design/mdi:google.svg?color=%2301acd7" height="16"> **Google AI** | Google AI Search Mode | `prompt-google-ai.js` |
| <img src="https://api.iconify.design/mdi:hand-heart.svg?color=%2301acd7" height="16"> **Meta AI** | Meta AI | `prompt-meta.js` |
| <img src="https://api.iconify.design/simple-icons:huggingface.svg?color=%2301acd7" height="16"> **HuggingChat** | HuggingChat | `prompt-huggingchat.js` |
| <img src="https://api.iconify.design/mdi:comment.svg?color=%2301acd7" height="16"> **Poe** | Quora Poe | `prompt-poe.js` |
| <img src="https://api.iconify.design/mdi:atom.svg?color=%2301acd7" height="16"> **Qwen** | Alibaba Qwen | `prompt-qwen.js` |
| <img src="https://api.iconify.design/mdi:chip.svg?color=%2301acd7" height="16"> **MiniMax** | MiniMax Agent | `prompt-minimax.js` |
| <img src="https://api.iconify.design/mdi:weather-night.svg?color=%2301acd7" height="16"> **Mistral** | Mistral AI | `prompt-mistral.js` |
| <img src="https://api.iconify.design/mdi:palette-outline.svg?color=%2301acd7" height="16"> **DeepAI** | DeepAI Chat | `prompt-deepai.js` |
| <img src="https://api.iconify.design/mdi:code-braces.svg?color=%2301acd7" height="16"> **FreeGPT** | FreeGPT | `prompt-freegpt.js` |
| <img src="https://api.iconify.design/mdi:application-brackets.svg?color=%2301acd7" height="16"> **LobeHub** | LobeHub AI | `prompt-lobehub.js` |
| <img src="https://api.iconify.design/mdi:eye-off.svg?color=%2301acd7" height="16"> **Venice** | Venice AI | `prompt-venice.js` |

---

## <img src="https://api.iconify.design/mdi:console-line.svg?color=%2301acd7" height="22"> Usage

```bash
# Basic usage — send a prompt to one provider
./wprompt "Your prompt here" -p claude

# Multiple providers (comma-separated)
./wprompt "Your prompt here" -p chatgpt,gemini,claude

# All 20 providers
./wprompt "Your prompt here" --all

# List all providers and aliases
./wprompt --list

# Show help
./wprompt --help
```

### Options

| Flag | Description |
| --- | --- |
| `-p, --provider <name>` | Target provider by name or alias (comma-separated) |
| `-a, --all` | Broadcast to all 20 supported AI platforms |
| `-l, --list` | List all providers and their aliases |
| `-h, --help` | Show help menu |

### Provider Aliases

<details>
<summary><strong>Click to expand all provider aliases</strong></summary>

| Provider | Aliases |
| --- | --- |
| `brave` | `brave-ai`, `bravesearch` |
| `chatgpt` | `gpt`, `openai` |
| `claude` | `anthropic` |
| `copilot` | `bing`, `ms-copilot` |
| `ddg` | `duckduckgo`, `ddg-ai` |
| `deepai` | `deepai-chat` |
| `deepseek` | `deepseek-ai` |
| `freegpt` | `freegpt-tech` |
| `gemini` | `bard` |
| `google-ai` | `google`, `searchlabs` |
| `grok` | `xai` |
| `huggingchat` | `hf`, `huggingface` |
| `lobehub` | `lobe` |
| `meta` | `meta-ai`, `llama` |
| `minimax` | `agent-minimax` |
| `mistral` | `mistral-chat` |
| `perplexity` | `pplx` |
| `poe` | `quora-poe` |
| `qwen` | `tongyi`, `qwen-ai` |
| `venice` | `venice-ai` |

</details>

---

## <img src="https://api.iconify.design/mdi:information-outline.svg?color=%2301acd7" height="22"> Requirements

> [!WARNING]
> **macOS only** — This tool depends on `chrome-cli` for browser automation.

| Requirement | Details |
| --- | --- |
| **OS** | macOS |
| **Browser** | Google Chrome |
| **CLI tool** | [`chrome-cli`](https://github.com/prasmussen/chrome-cli) |
| **Runtime** | Node.js (any recent version) |
| **Provider sessions** | Target AI platform must be logged in on an open Chrome tab |

> [!NOTE]
> Each provider script locates or opens the appropriate browser tab, waits for it to finish loading, then injects JavaScript to enter the prompt and click send. Ensure you are signed in to the target platform before dispatching.

---

## <img src="https://api.iconify.design/mdi:file-tree.svg?color=%2301acd7" height="22"> Structure

```text
send-prompt/
├── wprompt                          # CLI entry point — dispatch prompts to providers
├── prompt-chatgpt.js                # OpenAI ChatGPT provider
├── prompt-claude.js                 # Anthropic Claude provider
├── prompt-gemini.js                 # Google Gemini provider
├── prompt-brave-ai.js               # Brave AI Search provider
├── prompt-deepseek.js               # DeepSeek Chat provider
├── prompt-copilot.js                # Microsoft Copilot provider
├── prompt-ddg.js                    # DuckDuckGo AI Chat provider
├── prompt-perplexity.js             # Perplexity AI provider
├── prompt-grok.js                   # xAI Grok provider
├── prompt-google-ai.js              # Google AI Search Mode provider
├── prompt-meta.js                   # Meta AI provider
├── prompt-huggingchat.js            # HuggingChat provider
├── prompt-poe.js                    # Quora Poe provider
├── prompt-qwen.js                   # Alibaba Qwen provider
├── prompt-minimax.js                # MiniMax Agent provider
├── prompt-mistral.js                # Mistral AI provider
├── prompt-deepai.js                 # DeepAI Chat provider
├── prompt-freegpt.js                # FreeGPT provider
├── prompt-lobehub.js                # LobeHub AI provider
└── prompt-venice.js                 # Venice AI provider
```

---

## <img src="https://api.iconify.design/mdi:book-open-page-variant-outline.svg?color=%2301acd7" height="22"> How It Works

<details>
<summary><strong>Click to expand the dispatch pipeline</strong></summary>

Each provider script follows the same four-step pipeline:

1. **Locate or open** — Find an existing Chrome tab for the provider's URL, or open a new one.
2. **Wait for load** — Poll `chrome-cli info` every 200ms until the page finishes loading.
3. **Find editor** — Query the DOM for the prompt textarea or contenteditable div (with provider-specific selectors as fallbacks).
4. **Inject and send** — Base64-encode a JavaScript snippet that sets the prompt text, dispatches input events, and clicks the send button (with Enter-key fallback).

The `wprompt` CLI acts as the orchestrator: it resolves provider names (including aliases) via a lookup map, then spawns each provider script in parallel using `spawnSync`.

</details>

---

## <img src="https://api.iconify.design/mdi:chat-outline.svg?color=%2301acd7" height="22"> Examples

| Task | Command |
| --- | --- |
| Quick Q&A | `./wprompt "What is DNS?" -p chatgpt` |
| Cross-check an answer | `./wprompt "Explain TCP/IP" -p claude,gemini,perplexity` |
| Brainstorm with all models | `./wprompt "Ideas for a side project" --all` |
| Research a topic | `./wprompt "Latest developments in Rust 2026" -p grok,chatgpt,mistral` |

---

## <img src="https://api.iconify.design/mdi:folder-open-outline.svg?color=%2301acd7" height="22"> Details

<details>
<summary><strong>Provider script internals</strong></summary>

All 20 provider scripts share the same runtime pattern:

```javascript
const { execSync } = require("child_process");

const prompt = process.argv[2];  // Prompt text from CLI argument

// 1. Find or open provider tab via chrome-cli
let tabs = JSON.parse(execSync("chrome-cli list tabs")).tabs;
let providerTab = tabs.find((tab) => tab.url.startsWith("https://provider.com/"));

// 2. Wait for page load
let interval = setInterval(() => {
  tabInfo = JSON.parse(execSync(`chrome-cli info -t ${tabInfo.id}`));
  if (!tabInfo.loading) { clearInterval(interval); executeScript(); }
}, 200);

// 3. Inject prompt + click send
function executeScript() {
  const pageCode = `(async function(text) { /* DOM automation */ })(${JSON.stringify(prompt)})`;
  const encodedCode = Buffer.from(pageCode).toString("base64");
  execSync(`chrome-cli execute 'eval(atob("${encodedCode}"))' -t ${tabInfo.id}`);
}
```

</details>

<details>
<summary><strong>Error handling</strong></summary>

- **Missing chrome-cli**: Scripts check for `chrome-cli` availability and exit with a helpful error if not found.
- **Unknown provider**: `wprompt` resolves aliases through `ALIAS_MAP`. If a name/alias doesn't match, it prints `Error: Unknown provider` and lists valid options.
- **Script file missing**: During dispatch, each provider checks if its script file exists. Missing files are reported per-provider without stopping other dispatches.
- **Non-zero exit**: Provider scripts that fail report their exit code per-provider while the CLI continues remaining dispatches.

</details>
