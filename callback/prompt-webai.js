#!/usr/bin/env node

const {
  execFileSync,
  spawn,
} = require("child_process");

const PROVIDERS = {
  chatgpt: {
    url: "https://chatgpt.com/",
    match: url =>
      url?.startsWith("https://chatgpt.com/"),

    editorSelectors: [
      "#prompt-textarea",
      'textarea[placeholder*="Message"]',
      'div[contenteditable="true"]',
    ],

    sendSelectors: [
      'button[data-testid="send-button"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
    ],

    responseJS: `
(() => {
  const messages = [
    ...document.querySelectorAll(
      '[data-message-author-role="assistant"]'
    )
  ];

  const last = messages.at(-1);

  const text = last
    ? (last.innerText || last.textContent || "").trim()
    : "";

  const generating = Boolean(
    document.querySelector(
      'button[data-testid="stop-button"],' +
      'button[aria-label*="Stop generating"],' +
      'button[aria-label*="Stop"]'
    )
  );

  return JSON.stringify({
    found: messages.length > 0,
    text,
    generating
  });
})()
`,
  },

  perplexity: {
    url: "https://www.perplexity.ai/",
    match: url =>
      url?.startsWith("https://www.perplexity.ai/"),

    editorSelectors: [
      'textarea[placeholder*="Ask"]',
      "textarea",
      '[contenteditable="true"]',
    ],

    sendSelectors: [
      'button[aria-label*="Submit"]',
      'button[aria-label*="Send"]',
      "button.bg-super",
      'button[type="submit"]',
    ],

    responseJS: `
(() => {
  const selectors = [
    '[data-testid*="answer"]',
    'main .prose',
    'main [class*="prose"]',
    'main [class*="answer"]'
  ];

  let nodes = [];

  for (const selector of selectors) {
    nodes.push(
      ...document.querySelectorAll(selector)
    );
  }

  nodes = [...new Set(nodes)];

  const useful = nodes.filter(node => {
    const text =
      (node.innerText || node.textContent || "").trim();

    return text.length > 20;
  });

  const last = useful.at(-1);

  const text = last
    ? (last.innerText || last.textContent || "").trim()
    : "";

  const generating = Boolean(
    document.querySelector(
      'button[aria-label*="Stop"],' +
      'button[aria-label*="Cancel"]'
    )
  );

  return JSON.stringify({
    found: Boolean(text),
    text,
    generating
  });
})()
`,
  },

  grok: {
    url: "https://grok.com/",
    match: url =>
      url?.includes("grok.com"),

    editorSelectors: [
      'textarea[placeholder*="Ask"]',
      'textarea[aria-label*="Grok"]',
      "textarea",
      'div[contenteditable="true"]',
    ],

    sendSelectors: [
      'button[aria-label*="Send"]',
      'button[type="submit"]',
      'button[aria-label*="Grok"]',
    ],

    responseJS: `
(() => {
  const selectors = [
    '[data-message-author-role="assistant"]',
    '[data-testid*="response"]',
    '[data-testid*="message"]',
    'main article',
    'main [class*="response"]',
    'main [class*="message"]'
  ];

  let nodes = [];

  for (const selector of selectors) {
    nodes.push(
      ...document.querySelectorAll(selector)
    );
  }

  nodes = [...new Set(nodes)];

  const useful = nodes.filter(node => {
    const text =
      (node.innerText || node.textContent || "").trim();

    return text.length > 20;
  });

  const last = useful.at(-1);

  const text = last
    ? (last.innerText || last.textContent || "").trim()
    : "";

  const generating = Boolean(
    document.querySelector(
      'button[aria-label*="Stop"],' +
      'button[aria-label*="Cancel"]'
    )
  );

  return JSON.stringify({
    found: Boolean(text),
    text,
    generating
  });
})()
`,
  },
};

const POLL_MS =
  Number(process.env.WEBAI_POLL_MS || 500);

const TIMEOUT_MS =
  Number(process.env.WEBAI_TIMEOUT_MS || 300000);

const DEBUG =
  process.env.DEBUG === "1";

const chromeEnv = {
  ...process.env,
  OUTPUT_FORMAT: "json",
};

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------

let providerName = "chatgpt";
let prepare = false;
let prepareBackground = false;

const promptParts = [];

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];

  if (arg === "--provider") {
    providerName = process.argv[++i];
    continue;
  }

  if (arg === "--prepare") {
    prepare = true;
    continue;
  }

  if (arg === "--prepare-background") {
    prepareBackground = true;
    continue;
  }

  promptParts.push(arg);
}

const provider =
  PROVIDERS[providerName];

if (!provider) {
  console.error(
    `Unknown provider: ${providerName}`
  );

  console.error(
    `Available: ${Object.keys(PROVIDERS).join(", ")}`
  );

  process.exit(1);
}

const prompt =
  promptParts.join(" ").trim();

const workerName =
  `webai-worker-${providerName}`;

// ------------------------------------------------------------
// Utilities
// ------------------------------------------------------------

function debug(...args) {
  if (DEBUG) {
    console.error(
      `[webai:${providerName}]`,
      ...args
    );
  }
}

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

function sleepSync(ms) {
  Atomics.wait(
    new Int32Array(
      new SharedArrayBuffer(4)
    ),
    0,
    0,
    ms
  );
}

function chrome(
  args,
  allowEmpty = false
) {
  try {
    const result = execFileSync(
      "chrome-cli",
      args.map(String),
      {
        encoding: "utf8",
        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],
        env: chromeEnv,
      }
    ).trim();

    if (!result && !allowEmpty) {
      throw new Error(
        "chrome-cli returned empty output"
      );
    }

    return result;
  } catch (error) {
    if (allowEmpty) {
      return "";
    }

    throw new Error(
      error.stderr
        ?.toString()
        .trim() ||
      error.message
    );
  }
}

function chromeJson(
  args,
  retries = 10
) {
  let last = "";

  for (
    let attempt = 0;
    attempt < retries;
    attempt++
  ) {
    last = chrome(args, true);

    if (last) {
      try {
        return JSON.parse(last);
      } catch {}
    }

    sleepSync(200);
  }

  throw new Error(
    "chrome-cli failed to return valid JSON" +
    (last
      ? `: ${last.slice(0, 200)}`
      : "")
  );
}

function unwrap(value) {
  if (value == null) return "";

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (typeof value === "object") {
    for (const key of [
      "result",
      "value",
      "output",
      "data",
    ]) {
      if (
        Object.prototype
          .hasOwnProperty
          .call(value, key)
      ) {
        return unwrap(value[key]);
      }
    }
  }

  return "";
}

function executeJS(
  tabId,
  javascript,
  retries = 8
) {
  for (
    let attempt = 0;
    attempt < retries;
    attempt++
  ) {
    const raw = chrome(
      [
        "execute",
        javascript,
        "-t",
        tabId,
      ],
      true
    );

    if (raw) {
      try {
        return unwrap(
          JSON.parse(raw)
        );
      } catch {
        return raw;
      }
    }

    sleepSync(200);
  }

  return "";
}

function getTabs() {
  const result =
    chromeJson([
      "list",
      "tabs",
    ]);

  return Array.isArray(result)
    ? result
    : result.tabs || [];
}

// ------------------------------------------------------------
// Worker management
// ------------------------------------------------------------

function isWorker(tabId) {
  const result =
    executeJS(
      tabId,
      `window.name || ""`,
      3
    );

  return result === workerName;
}

function findWorker() {
  let tabs;

  try {
    tabs = getTabs();
  } catch {
    return null;
  }

  const candidates =
    tabs.filter(tab =>
      provider.match(tab.url)
    );

  for (const tab of candidates) {
    try {
      if (isWorker(tab.id)) {
        return tab;
      }
    } catch {}
  }

  return null;
}

async function waitForPage(tabId) {
  const started = Date.now();

  while (
    Date.now() - started <
    30000
  ) {
    try {
      const info =
        chromeJson(
          [
            "info",
            "-t",
            tabId,
          ],
          3
        );

      if (!info.loading) {
        return;
      }
    } catch {}

    await sleep(200);
  }

  throw new Error(
    "Timed out waiting for page load"
  );
}

function editorExists(tabId) {
  const selectors =
    JSON.stringify(
      provider.editorSelectors
    );

  return (
    executeJS(
      tabId,
      `
(() => {
  const selectors = ${selectors};

  return selectors.some(selector =>
    document.querySelector(selector)
  )
    ? "YES"
    : "NO";
})()
`
    ) === "YES"
  );
}

async function waitForEditor(tabId) {
  const started = Date.now();

  while (
    Date.now() - started <
    30000
  ) {
    if (editorExists(tabId)) {
      return;
    }

    await sleep(250);
  }

  throw new Error(
    `${providerName} input box not found`
  );
}

async function createWorker() {
  const before =
    new Set(
      getTabs().map(tab =>
        String(tab.id)
      )
    );

  debug("Creating worker tab");

  /*
   * Open but never activate/focus it.
   */
  chrome(
    [
      "open",
      provider.url,
    ],
    true
  );

  for (let i = 0; i < 80; i++) {
    await sleep(250);

    let tabs;

    try {
      tabs = getTabs();
    } catch {
      continue;
    }

    const tab =
      tabs.find(item => {
        return (
          !before.has(
            String(item.id)
          ) &&
          provider.match(item.url)
        );
      });

    if (!tab) {
      continue;
    }

    await waitForPage(tab.id);
    await waitForEditor(tab.id);

    executeJS(
      tab.id,
      `window.name = ${JSON.stringify(
        workerName
      )}; "OK"`
    );

    debug(
      "Worker created:",
      tab.id
    );

    return tab;
  }

  throw new Error(
    "Could not create worker tab"
  );
}

async function getWorker() {
  let worker = findWorker();

  if (worker) {
    debug(
      "Found worker:",
      worker.id
    );

    return worker;
  }

  return createWorker();
}

async function resetWorker(tabId) {
  debug(
    "Resetting worker:",
    tabId
  );

  /*
   * Fresh conversation every request.
   */
  chrome(
    [
      "open",
      provider.url,
      "-t",
      tabId,
    ],
    true
  );

  await waitForPage(tabId);
  await waitForEditor(tabId);

  /*
   * window.name generally survives navigation,
   * but set it again anyway.
   */
  executeJS(
    tabId,
    `window.name = ${JSON.stringify(
      workerName
    )}; "OK"`
  );
}

// ------------------------------------------------------------
// Prompt insertion
// ------------------------------------------------------------

function insertPrompt(
  tabId,
  text
) {
  const selectors =
    JSON.stringify(
      provider.editorSelectors
    );

  const result =
    executeJS(
      tabId,
      `
(() => {
  const selectors = ${selectors};
  const text = ${JSON.stringify(text)};

  let editor = null;

  for (const selector of selectors) {
    editor =
      document.querySelector(
        selector
      );

    if (editor) break;
  }

  if (!editor) {
    return "NO_EDITOR";
  }

  editor.focus();

  if (
    editor.tagName === "TEXTAREA" ||
    editor.tagName === "INPUT"
  ) {
    const proto =
      editor.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

    const setter =
      Object.getOwnPropertyDescriptor(
        proto,
        "value"
      )?.set;

    if (setter) {
      setter.call(
        editor,
        text
      );
    } else {
      editor.value = text;
    }

    editor.dispatchEvent(
      new Event(
        "input",
        {
          bubbles: true
        }
      )
    );

    editor.dispatchEvent(
      new Event(
        "change",
        {
          bubbles: true
        }
      )
    );
  } else {
    editor.innerHTML = "";
    editor.focus();

    document.execCommand(
      "insertText",
      false,
      text
    );

    editor.dispatchEvent(
      new InputEvent(
        "input",
        {
          bubbles: true,
          inputType: "insertText",
          data: text
        }
      )
    );
  }

  return "OK";
})()
`
    );

  if (result !== "OK") {
    throw new Error(
      "Could not insert prompt"
    );
  }
}

async function sendPrompt(tabId) {
  const selectors =
    JSON.stringify(
      provider.sendSelectors
    );

  for (let i = 0; i < 50; i++) {
    const result =
      executeJS(
        tabId,
        `
(() => {
  const selectors = ${selectors};

  for (const selector of selectors) {
    const button =
      document.querySelector(
        selector
      );

    if (
      button &&
      !button.disabled
    ) {
      button.click();
      return "SENT";
    }
  }

  return "WAIT";
})()
`
      );

    if (result === "SENT") {
      return;
    }

    await sleep(200);
  }

  /*
   * Enter fallback.
   */
  const editorSelectors =
    JSON.stringify(
      provider.editorSelectors
    );

  const result =
    executeJS(
      tabId,
      `
(() => {
  const selectors =
    ${editorSelectors};

  let editor = null;

  for (const selector of selectors) {
    editor =
      document.querySelector(
        selector
      );

    if (editor) break;
  }

  if (!editor) {
    return "FAIL";
  }

  editor.focus();

  editor.dispatchEvent(
    new KeyboardEvent(
      "keydown",
      {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true
      }
    )
  );

  return "SENT";
})()
`
    );

  if (result !== "SENT") {
    throw new Error(
      "Could not send prompt"
    );
  }
}

// ------------------------------------------------------------
// Response
// ------------------------------------------------------------

function getResponseState(tabId) {
  const raw =
    executeJS(
      tabId,
      provider.responseJS
    );

  if (!raw) {
    return {
      found: false,
      text: "",
      generating: false,
    };
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {
      found: false,
      text: "",
      generating: false,
    };
  }
}

async function waitForResponse(tabId) {
  const started = Date.now();

  let lastText = "";
  let changedAt = null;

  while (
    Date.now() - started <
    TIMEOUT_MS
  ) {
    await sleep(POLL_MS);

    let state;

    try {
      state =
        getResponseState(tabId);
    } catch {
      continue;
    }

    if (
      !state.found ||
      !state.text
    ) {
      continue;
    }

    if (
      state.text !== lastText
    ) {
      lastText =
        state.text;

      changedAt =
        Date.now();

      debug(
        "Response length:",
        lastText.length
      );

      continue;
    }

    if (!changedAt) {
      changedAt =
        Date.now();
    }

    const stableFor =
      Date.now() -
      changedAt;

    /*
     * Normal:
     * model stopped + text unchanged 2 sec.
     */
    if (
      !state.generating &&
      stableFor >= 2000
    ) {
      return lastText;
    }

    /*
     * DOM fallback:
     * text unchanged 5 sec.
     */
    if (
      stableFor >= 5000
    ) {
      return lastText;
    }
  }

  if (lastText) {
    return lastText;
  }

  throw new Error(
    `Timed out waiting for ${providerName}`
  );
}

// ------------------------------------------------------------
// Background preparation
// ------------------------------------------------------------

function prepareInBackground() {
  debug(
    "Launching background prepare"
  );

  const child = spawn(
    process.execPath,
    [
      __filename,
      "--provider",
      providerName,
      "--prepare",
    ],
    {
      detached: true,
      stdio: "ignore",
      env: process.env,
    }
  );

  child.unref();
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------

async function main() {
  if (prepareBackground) {
    prepareInBackground();
    return;
  }

  if (prepare) {
    const worker =
      await getWorker();

    await waitForPage(
      worker.id
    );

    await waitForEditor(
      worker.id
    );

    debug(
      "Worker ready:",
      worker.id
    );

    return;
  }

  if (!prompt) {
    console.error(
      `Usage:
  prompt-webai.js --provider chatgpt 'prompt'
  prompt-webai.js --provider perplexity 'prompt'
  prompt-webai.js --provider grok 'prompt'

  prompt-webai.js --provider chatgpt --prepare
  prompt-webai.js --provider chatgpt --prepare-background`
    );

    process.exit(1);
  }

  const worker =
    await getWorker();

  debug(
    "Using worker:",
    worker.id
  );

  /*
   * Always start actual query from a clean conversation.
   */
  await resetWorker(
    worker.id
  );

  debug(
    "Inserting prompt"
  );

  insertPrompt(
    worker.id,
    prompt
  );

  await sleep(300);

  debug(
    "Sending prompt"
  );

  await sendPrompt(
    worker.id
  );

  debug(
    "Waiting for response"
  );

  const response =
    await waitForResponse(
      worker.id
    );

  /*
   * stdout = provider answer ONLY.
   */
  process.stdout.write(
    response.trim() + "\n"
  );
}

main().catch(error => {
  console.error(
    `webai-${providerName}: ${error.message}`
  );

  process.exit(1);
});