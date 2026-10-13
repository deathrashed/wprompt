#!/usr/bin/env node

const {
  execFileSync,
  spawn,
} = require("child_process");

const path = require("path");

const DEBUG =
  process.env.DEBUG === "1";

const POLL_MS =
  Number(
    process.env.CHATGPT_POLL_MS ||
    500
  );

const TIMEOUT_MS =
  Number(
    process.env.CHATGPT_TIMEOUT_MS ||
    600000
  ); // 10 minutes

const HEARTBEAT_MS =
  Number(
    process.env.CHATGPT_HEARTBEAT_MS ||
    15000
  );

const env = {
  ...process.env,
  OUTPUT_FORMAT: "json",
};

const WORKER_NAME =
  "chatgpt-bio-worker";

const CHATGPT_URL =
  "https://chatgpt.com/";

function debug(...args) {
  if (DEBUG) {
    console.error(
      "[prompt-gpt]",
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
  {
    allowEmpty = false,
    retries = 1,
    retryDelay = 200,
  } = {}
) {
  let lastError = null;
  let lastOutput = "";

  for (
    let attempt = 1;
    attempt <= retries;
    attempt++
  ) {
    try {
      const out =
        execFileSync(
          "chrome-cli",
          args.map(String),
          {
            encoding: "utf8",
            stdio: [
              "ignore",
              "pipe",
              "pipe",
            ],
            env,
          }
        ).trim();

      lastOutput = out;

      if (
        out ||
        allowEmpty
      ) {
        return out;
      }
    } catch (error) {
      lastError = error;

      debug(
        `chrome-cli failed (${attempt}/${retries}):`,
        error.stderr
          ?.toString()
          .trim() ||
          error.message
      );
    }

    if (
      attempt < retries
    ) {
      sleepSync(
        retryDelay
      );
    }
  }

  if (allowEmpty) {
    return lastOutput;
  }

  throw new Error(
    lastError?.stderr
      ?.toString()
      .trim() ||
    lastError?.message ||
    "chrome-cli returned empty output"
  );
}

function chromeJson(
  args,
  retries = 10,
  retryDelay = 200
) {
  let last = "";

  for (
    let attempt = 1;
    attempt <= retries;
    attempt++
  ) {
    last = chrome(
      args,
      {
        allowEmpty: true,
      }
    );

    if (last) {
      try {
        return JSON.parse(
          last
        );
      } catch {
        debug(
          `Invalid JSON from chrome-cli (${attempt}/${retries}):`,
          last.slice(
            0,
            200
          )
        );
      }
    }

    if (
      attempt < retries
    ) {
      sleepSync(
        retryDelay
      );
    }
  }

  throw new Error(
    "chrome-cli did not return valid JSON" +
    (
      last
        ? `: ${last.slice(0, 300)}`
        : ""
    )
  );
}

function unwrap(value) {
  if (
    value == null
  ) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(
      value
    );
  }

  if (
    typeof value === "object"
  ) {
    for (
      const key of [
        "result",
        "value",
        "output",
        "data",
      ]
    ) {
      if (
        Object.prototype
          .hasOwnProperty
          .call(
            value,
            key
          )
      ) {
        return unwrap(
          value[key]
        );
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
  let last = "";

  for (
    let attempt = 1;
    attempt <= retries;
    attempt++
  ) {
    last = chrome(
      [
        "execute",
        javascript,
        "-t",
        String(tabId),
      ],
      {
        allowEmpty: true,
      }
    );

    if (last) {
      try {
        return unwrap(
          JSON.parse(
            last
          )
        );
      } catch {
        return last;
      }
    }

    if (
      attempt < retries
    ) {
      sleepSync(200);
    }
  }

  return "";
}

function listTabs() {
  const result =
    chromeJson(
      [
        "list",
        "tabs",
      ]
    );

  return Array.isArray(
    result
  )
    ? result
    : result.tabs || [];
}

function isChatGPTTab(
  tab
) {
  return (
    typeof tab?.url ===
      "string" &&
    tab.url.startsWith(
      CHATGPT_URL
    )
  );
}

function isWorkerTab(
  tab
) {
  if (
    !isChatGPTTab(
      tab
    )
  ) {
    return false;
  }

  try {
    return (
      executeJS(
        tab.id,
        `window.name || ""`,
        3
      ) ===
      WORKER_NAME
    );
  } catch {
    return false;
  }
}

function findWorkerTab() {
  const tabs =
    listTabs();

  return (
    tabs.find(
      isWorkerTab
    ) ||
    null
  );
}

async function waitForPage(
  tabId,
  timeoutMs = 30000
) {
  const started =
    Date.now();

  while (
    Date.now() -
      started <
    timeoutMs
  ) {
    try {
      const info =
        chromeJson(
          [
            "info",
            "-t",
            String(tabId),
          ],
          3,
          150
        );

      if (
        !info.loading
      ) {
        return;
      }
    } catch {}

    await sleep(200);
  }

  throw new Error(
    "Timed out waiting for ChatGPT page to load"
  );
}

function editorExists(
  tabId
) {
  const result =
    executeJS(
      tabId,
      `
(() => {
  return Boolean(
    document.querySelector('#prompt-textarea') ||
    document.querySelector('textarea[placeholder*="Message"]') ||
    document.querySelector('div[contenteditable="true"]')
  ) ? "YES" : "NO";
})()
`
    );

  return (
    result === "YES"
  );
}

async function waitForEditor(
  tabId,
  timeoutMs = 30000
) {
  const started =
    Date.now();

  while (
    Date.now() -
      started <
    timeoutMs
  ) {
    try {
      if (
        editorExists(
          tabId
        )
      ) {
        return;
      }
    } catch {}

    await sleep(250);
  }

  throw new Error(
    "ChatGPT prompt box not found"
  );
}

function markWorker(
  tabId
) {
  executeJS(
    tabId,
    `
window.name = ${JSON.stringify(
      WORKER_NAME
    )};
"OK"
`
  );
}

async function createWorkerTab() {
  debug(
    "Creating worker tab"
  );

  const before =
    new Set(
      listTabs().map(
        tab =>
          String(
            tab.id
          )
      )
    );

  let openedId =
    null;

  const raw =
    chrome(
      [
        "open",
        CHATGPT_URL,
      ],
      {
        allowEmpty: true,
      }
    );

  if (raw) {
    try {
      const parsed =
        JSON.parse(
          raw
        );

      openedId =
        parsed?.id ??
        null;
    } catch {}
  }

  for (
    let i = 0;
    i < 80;
    i++
  ) {
    await sleep(250);

    let candidate =
      null;

    let tabs = [];

    try {
      tabs =
        listTabs();
    } catch {
      continue;
    }

    if (
      openedId != null
    ) {
      candidate =
        tabs.find(
          tab =>
            String(
              tab.id
            ) ===
            String(
              openedId
            )
        );
    }

    if (
      !candidate
    ) {
      candidate =
        tabs.find(
          tab =>
            !before.has(
              String(
                tab.id
              )
            ) &&
            isChatGPTTab(
              tab
            )
        );
    }

    if (
      !candidate
    ) {
      continue;
    }

    await waitForPage(
      candidate.id
    );

    /*
     * IMPORTANT:
     * Activate worker tab so Chrome actually initializes it.
     *
     * This does NOT use --focus, so Chrome itself should not
     * necessarily be brought to the foreground.
     */
    try {
      chrome(
        [
          "activate",
          "-t",
          String(
            candidate.id
          ),
        ],
        {
          allowEmpty: true,
        }
      );
    } catch {}

    await waitForEditor(
      candidate.id
    );

    markWorker(
      candidate.id
    );

    debug(
      "Worker tab created:",
      candidate.id
    );

    return candidate;
  }

  throw new Error(
    "Could not create ChatGPT worker tab"
  );
}

async function getWorkerTab() {
  let worker = null;

  try {
    worker =
      findWorkerTab();
  } catch {}

  if (worker) {
    debug(
      "Found worker tab:",
      worker.id
    );

    return worker;
  }

  return createWorkerTab();
}

async function resetWorkerTab(
  tabId
) {
  debug(
    "Resetting worker tab:",
    tabId
  );

  /*
   * Reset worker to a clean new ChatGPT conversation.
   */
  chrome(
    [
      "open",
      CHATGPT_URL,
      "-t",
      String(tabId),
    ],
    {
      allowEmpty: true,
    }
  );

  await waitForPage(
    tabId
  );

  /*
   * IMPORTANT:
   * Activate the worker before waiting for the editor or sending.
   *
   * Chrome may otherwise leave background tabs lazy/throttled
   * until the user manually selects them.
   */
  try {
    chrome(
      [
        "activate",
        "-t",
        String(tabId),
      ],
      {
        allowEmpty: true,
      }
    );
  } catch {}

  await waitForEditor(
    tabId
  );

  markWorker(
    tabId
  );
}

function insertPrompt(
  tabId,
  text
) {
  const result =
    executeJS(
      tabId,
      `
(() => {
  const text = ${JSON.stringify(
    text
  )};

  const editor =
    document.querySelector('#prompt-textarea') ||
    document.querySelector('textarea[placeholder*="Message"]') ||
    document.querySelector('div[contenteditable="true"]');

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
      editor.value =
        text;
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
          inputType:
            "insertText",
          data: text
        }
      )
    );
  }

  return "OK";
})()
`
    );

  if (
    result !== "OK"
  ) {
    throw new Error(
      "Could not insert prompt into ChatGPT"
    );
  }
}

async function sendPrompt(
  tabId
) {
  for (
    let i = 0;
    i < 60;
    i++
  ) {
    const result =
      executeJS(
        tabId,
        `
(() => {
  const button =
    document.querySelector('button[data-testid="send-button"]') ||
    document.querySelector('button[aria-label*="Send"]') ||
    document.querySelector('button[aria-label*="send"]');

  if (!button) {
    return "NO_BUTTON";
  }

  if (button.disabled) {
    return "DISABLED";
  }

  button.click();
  return "SENT";
})()
`
      );

    if (
      result === "SENT"
    ) {
      return;
    }

    await sleep(200);
  }

  /*
   * Last-resort Enter fallback.
   */
  const fallback =
    executeJS(
      tabId,
      `
(() => {
  const editor =
    document.querySelector('#prompt-textarea') ||
    document.querySelector('textarea[placeholder*="Message"]') ||
    document.querySelector('div[contenteditable="true"]');

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

  if (
    fallback !==
    "SENT"
  ) {
    throw new Error(
      "Could not submit prompt to ChatGPT"
    );
  }
}

function getResponseState(
  tabId
) {
  const result =
    executeJS(
      tabId,
      `
(() => {
  const messages = [
    ...document.querySelectorAll(
      '[data-message-author-role="assistant"]'
    )
  ];

  const last =
    messages.length
      ? messages[
          messages.length - 1
        ]
      : null;

  const text =
    last
      ? (
          last.innerText ||
          last.textContent ||
          ""
        ).trim()
      : "";

  const generating =
    Boolean(
      document.querySelector(
        'button[data-testid="stop-button"],' +
        'button[aria-label*="Stop generating"],' +
        'button[aria-label*="Stop"],' +
        'button[aria-label*="stop"]'
      )
    );

  return JSON.stringify({
    count:
      messages.length,
    text,
    generating
  });
})()
`
    );

  if (!result) {
    return {
      count: 0,
      text: "",
      generating: false,
    };
  }

  try {
    return JSON.parse(
      result
    );
  } catch {
    return {
      count: 0,
      text: "",
      generating: false,
    };
  }
}

async function waitForResponse(
  tabId
) {
  const started =
    Date.now();

  let lastHeartbeat =
    started;

  let lastText = "";
  let stableSince =
    null;

  while (
    Date.now() -
      started <
    TIMEOUT_MS
  ) {
    await sleep(
      POLL_MS
    );

    /*
     * Heartbeat goes to stderr only.
     * Useful when Claude is waiting several minutes.
     */
    if (
      Date.now() -
        lastHeartbeat >=
      HEARTBEAT_MS
    ) {
      debug(
        `Still waiting for ChatGPT response... ${
          Math.round(
            (
              Date.now() -
              started
            ) /
              1000
          )
        }s`
      );

      lastHeartbeat =
        Date.now();
    }

    let state;

    try {
      state =
        getResponseState(
          tabId
        );
    } catch (error) {
      debug(
        "Response-state read failed:",
        error.message
      );

      continue;
    }

    if (
      state.count < 1 ||
      !state.text
    ) {
      continue;
    }

    if (
      state.text !==
      lastText
    ) {
      lastText =
        state.text;

      stableSince =
        Date.now();

      debug(
        "Response length:",
        lastText.length
      );

      continue;
    }

    if (
      !stableSince
    ) {
      stableSince =
        Date.now();
    }

    const stableFor =
      Date.now() -
      stableSince;

    /*
     * Normal completion:
     *
     * stop button disappeared and response has remained
     * unchanged for at least 2 seconds.
     */
    if (
      !state.generating &&
      stableFor >=
        2000
    ) {
      return lastText;
    }

    /*
     * Fallback:
     *
     * If ChatGPT changes its stop-button selector,
     * five seconds of unchanged text is enough.
     */
    if (
      stableFor >=
      5000
    ) {
      return lastText;
    }
  }

  /*
   * If we captured useful response text before timeout,
   * return it rather than throwing away the research.
   */
  if (lastText) {
    debug(
      "Timeout reached; returning last captured response text"
    );

    return lastText;
  }

  throw new Error(
    `Timed out after ${
      Math.round(
        TIMEOUT_MS /
          1000
      )
    }s waiting for ChatGPT response`
  );
}

function prepareInBackground() {
  debug(
    "Launching background worker preparation"
  );

  const child =
    spawn(
      process.execPath,
      [
        path.resolve(
          __filename
        ),
        "--prepare",
      ],
      {
        detached: true,
        stdio: "ignore",
        env:
          process.env,
      }
    );

  child.unref();
}

async function prepare() {
  const worker =
    await getWorkerTab();

  /*
   * Activate once during preparation so Chrome fully initializes it.
   */
  try {
    chrome(
      [
        "activate",
        "-t",
        String(
          worker.id
        ),
      ],
      {
        allowEmpty: true,
      }
    );
  } catch {}

  await waitForPage(
    worker.id
  );

  await waitForEditor(
    worker.id
  );

  markWorker(
    worker.id
  );

  debug(
    "Worker ready:",
    worker.id
  );
}

async function runPrompt(
  prompt
) {
  const worker =
    await getWorkerTab();

  debug(
    "Using worker tab:",
    worker.id
  );

  await resetWorkerTab(
    worker.id
  );

  debug(
    "Inserting prompt"
  );

  insertPrompt(
    worker.id,
    prompt
  );

  await sleep(350);

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
   * stdout = answer only.
   *
   * Claude/Codex/OpenCode can consume this directly.
   */
  process.stdout.write(
    response.trim() +
    "\n"
  );
}

async function main() {
  const args =
    process.argv.slice(2);

  if (
    args.includes(
      "--prepare-background"
    )
  ) {
    prepareInBackground();
    return;
  }

  if (
    args.includes(
      "--prepare"
    )
  ) {
    await prepare();
    return;
  }

  const prompt =
    args
      .filter(
        arg =>
          !arg.startsWith(
            "--"
          )
      )
      .join(" ")
      .trim();

  if (!prompt) {
    console.error(
      [
        "Usage:",
        "  prompt-gpt.js --prepare",
        "  prompt-gpt.js --prepare-background",
        "  prompt-gpt.js 'your prompt'",
      ].join("\n")
    );

    process.exit(1);
  }

  /*
   * IMPORTANT:
   *
   * Actual prompt execution is intentionally synchronous.
   * The caller should NOT append `&` if it needs the response.
   */
  await runPrompt(
    prompt
  );
}

main().catch(error => {
  console.error(
    `prompt-gpt: ${error.message}`
  );

  process.exit(1);
});