#!/usr/bin/env node

const { execFileSync } = require("child_process");

const prompt = process.argv.slice(2).join(" ").trim();

if (!prompt) {
  console.error("Usage: prompt-gpt.js 'your prompt'");
  process.exit(1);
}

const POLL_MS = 500;
const TIMEOUT_MS = 300000;
const DEBUG = process.env.DEBUG === "1";

function debug(...args) {
  if (DEBUG) console.error("[prompt-gpt]", ...args);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function exec(command, args = [], options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function chrome(args, json = false) {
  const env = { ...process.env };

  if (json) {
    env.OUTPUT_FORMAT = "json";
  } else {
    delete env.OUTPUT_FORMAT;
  }

  return exec("chrome-cli", args.map(String), { env });
}

function osascript(script) {
  return exec("osascript", ["-e", script]);
}

function listTabs() {
  const output = chrome(["list", "tabs"], true);
  return JSON.parse(output).tabs || [];
}

function tabRef(tab) {
  return tab.windowId != null
    ? `${tab.windowId}:${tab.id}`
    : String(tab.id);
}

function execute(tab, javascript) {
  return chrome([
    "execute",
    javascript,
    "-t",
    tabRef(tab),
  ]);
}

function executeJSON(tab, javascript) {
  const result = execute(tab, javascript);

  try {
    return JSON.parse(result);
  } catch {
    throw new Error(
      `Could not parse JavaScript result:\n${result}`
    );
  }
}

/* --------------------------------------------------------- */
/* CURRENT APP                                                */
/* --------------------------------------------------------- */

function getFrontmostBundleID() {
  try {
    return osascript(`
tell application "System Events"
    set p to first application process whose frontmost is true
    return bundle identifier of p
end tell
`);
  } catch {
    return "";
  }
}

function restoreApp(bundleID) {
  if (!bundleID || bundleID === "com.google.Chrome") return;

  try {
    osascript(`
tell application id "${bundleID}"
    activate
end tell
`);
  } catch (error) {
    debug("Could not restore previous app:", error.message);
  }
}

/* --------------------------------------------------------- */
/* CLIPBOARD                                                  */
/* --------------------------------------------------------- */

function getClipboard() {
  try {
    return execFileSync("pbpaste", [], {
      encoding: "utf8",
    });
  } catch {
    return "";
  }
}

function setClipboard(text) {
  execFileSync("pbcopy", [], {
    input: text,
    encoding: "utf8",
  });
}

/* --------------------------------------------------------- */
/* CHROME                                                     */
/* --------------------------------------------------------- */

function chromeRunning() {
  try {
    exec("pgrep", ["-x", "Google Chrome"]);
    return true;
  } catch {
    return false;
  }
}

async function ensureChrome() {
  if (chromeRunning()) return;

  debug("Starting Chrome");

  exec("open", [
    "-g",
    "-j",
    "-b",
    "com.google.Chrome",
  ]);

  const start = Date.now();

  while (Date.now() - start < 10000) {
    try {
      listTabs();
      return;
    } catch {
      await sleep(200);
    }
  }

  throw new Error("Google Chrome did not start.");
}

function findChatGPTTab() {
  return listTabs().find(tab => {
    try {
      const url = new URL(tab.url);

      return (
        url.hostname === "chatgpt.com" ||
        url.hostname === "www.chatgpt.com"
      );
    } catch {
      return false;
    }
  });
}

async function getChatGPTTab() {
  let tab = findChatGPTTab();

  if (tab) {
    debug("Using existing ChatGPT tab", tabRef(tab));
    return tab;
  }

  debug("Opening ChatGPT");

  chrome([
    "open",
    "https://chatgpt.com/",
  ]);

  const start = Date.now();

  while (Date.now() - start < 15000) {
    tab = findChatGPTTab();

    if (tab) return tab;

    await sleep(200);
  }

  throw new Error("Could not find ChatGPT tab.");
}

/* --------------------------------------------------------- */
/* IMPORTANT: ACTUALLY FOCUS TAB                              */
/* --------------------------------------------------------- */

async function focusChatGPT(tab) {
  debug("Foregrounding ChatGPT tab", tabRef(tab));

  chrome([
    "activate",
    "-t",
    tabRef(tab),
    "--focus",
  ]);

  /*
   * Give Chrome time to:
   *   - raise window
   *   - switch tab
   *   - render ChatGPT
   *   - resume backgrounded React UI
   */
  await sleep(700);
}

/* --------------------------------------------------------- */
/* COMPOSER                                                   */
/* --------------------------------------------------------- */

async function focusComposer(tab) {
  const start = Date.now();

  while (Date.now() - start < 20000) {
    try {
      const state = executeJSON(tab, `
(() => {
    const selectors = [
        "#prompt-textarea",
        'textarea[name="prompt-textarea"]',
        '[contenteditable="true"][data-lexical-editor="true"]',
        '.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"]'
    ];

    let editor = null;

    for (const selector of selectors) {
        const candidate = document.querySelector(selector);

        if (
            candidate &&
            candidate.getClientRects().length > 0
        ) {
            editor = candidate;
            break;
        }
    }

    if (!editor) {
        return JSON.stringify({
            found: false,
            url: location.href,
            title: document.title
        });
    }

    editor.scrollIntoView({
        block: "center"
    });

    editor.focus();
    editor.click();

    return JSON.stringify({
        found: true,
        active:
            document.activeElement === editor ||
            editor.contains(document.activeElement),
        tag: editor.tagName,
        id: editor.id || "",
        className: String(editor.className || "")
    });
})()
`);

      if (state.found) {
        debug(
          "Composer found:",
          state.tag,
          state.id || state.className
        );

        /*
         * Give macOS a moment to recognise Chrome's
         * newly focused text field.
         */
        await sleep(150);

        return;
      }
    } catch (error) {
      debug("Composer check:", error.message);
    }

    await sleep(250);
  }

  throw new Error(
    "ChatGPT composer still not found after foregrounding the tab."
  );
}

/* --------------------------------------------------------- */
/* REAL KEYBOARD INPUT                                        */
/* --------------------------------------------------------- */

async function pasteAndSend(text) {
  const previousClipboard = getClipboard();

  setClipboard(text);

  try {
    /*
     * Real macOS input.
     *
     * Composer is already focused by JavaScript.
     *
     * Cmd+A:
     *   clear any existing draft
     *
     * Cmd+V:
     *   paste prompt
     *
     * Enter:
     *   submit
     */

    osascript(`
tell application "System Events"
    keystroke "a" using command down
    delay 0.05

    keystroke "v" using command down
    delay 0.15

    key code 36
end tell
`);

    await sleep(250);
  } finally {
    /*
     * Restore clipboard after Chrome has consumed paste.
     */
    await sleep(150);

    try {
      setClipboard(previousClipboard);
    } catch {}
  }
}

/* --------------------------------------------------------- */
/* RESPONSE STATE                                             */
/* --------------------------------------------------------- */

function getResponseState(tab) {
  return executeJSON(tab, `
(() => {
    const messages = [
        ...document.querySelectorAll(
            '[data-message-author-role="assistant"]'
        )
    ];

    const last = messages.at(-1);

    let text = "";

    if (last) {
        const content =
            last.querySelector(".markdown") ||
            last.querySelector(".markdown-new-styling") ||
            last;

        text = (content.innerText || "").trim();
    }

    const stopButton =
        document.querySelector(
            'button[data-testid="stop-button"]'
        ) ||
        document.querySelector(
            'button[aria-label*="Stop"]'
        );

    const composer =
        document.querySelector("#prompt-textarea") ||
        document.querySelector(
            'textarea[name="prompt-textarea"]'
        ) ||
        document.querySelector(
            '[contenteditable="true"][data-lexical-editor="true"]'
        ) ||
        document.querySelector(
            '.ProseMirror[contenteditable="true"]'
        );

    let composerText = "";

    if (composer) {
        if (
            composer instanceof HTMLTextAreaElement ||
            composer instanceof HTMLInputElement
        ) {
            composerText = composer.value || "";
        } else {
            composerText = composer.innerText || "";
        }
    }

    return JSON.stringify({
        count: messages.length,
        text,
        generating: !!stopButton,
        composerText: composerText.trim()
    });
})()
`);
}

async function waitForSubmission(tab, oldCount) {
  const start = Date.now();

  while (Date.now() - start < 5000) {
    try {
      const state = getResponseState(tab);

      /*
       * Successful submit normally causes at least one:
       *
       * - composer becomes empty
       * - stop-generation button appears
       * - assistant message appears
       */

      if (
        state.composerText === "" ||
        state.generating ||
        state.count > oldCount
      ) {
        debug("Prompt submitted");
        return true;
      }
    } catch {}

    await sleep(100);
  }

  return false;
}

/* --------------------------------------------------------- */
/* FALLBACK SEND BUTTON                                       */
/* --------------------------------------------------------- */

function clickSendButton(tab) {
  return executeJSON(tab, `
(() => {
    const button =
        document.querySelector(
            'button[data-testid="send-button"]'
        ) ||
        document.querySelector(
            '#composer-submit-button'
        ) ||
        document.querySelector(
            'button[aria-label*="Send"]'
        );

    if (!button) {
        return JSON.stringify({
            clicked: false
        });
    }

    button.click();

    return JSON.stringify({
        clicked: true
    });
})()
`);
}

/* --------------------------------------------------------- */
/* WAIT FOR ANSWER                                            */
/* --------------------------------------------------------- */

async function waitForResponse(tab, previousCount) {
  const start = Date.now();

  let lastText = "";
  let stable = 0;

  while (Date.now() - start < TIMEOUT_MS) {
    let state;

    try {
      state = getResponseState(tab);
    } catch {
      await sleep(POLL_MS);
      continue;
    }

    const newResponse =
      state.count > previousCount &&
      state.text.length > 0;

    if (newResponse) {
      debug(
        "Response:",
        `${state.text.length} chars`,
        state.generating ? "(generating)" : ""
      );

      if (
        !state.generating &&
        state.text === lastText
      ) {
        stable++;
      } else {
        stable = 0;
      }

      lastText = state.text;

      /*
       * Same completed text for 3 polls =
       * response has settled.
       */
      if (!state.generating && stable >= 3) {
        return state.text;
      }
    }

    await sleep(POLL_MS);
  }

  throw new Error(
    "Timed out waiting for ChatGPT response."
  );
}

/* --------------------------------------------------------- */
/* MAIN                                                       */
/* --------------------------------------------------------- */

async function main() {
  const previousApp = getFrontmostBundleID();

  debug("Previous app:", previousApp || "unknown");

  await ensureChrome();

  const tab = await getChatGPTTab();

  debug("Tab:", tabRef(tab));

  /*
   * THIS IS WHAT YOUR OLD VERSION WAS MISSING.
   */
  await focusChatGPT(tab);

  await focusComposer(tab);

  /*
   * Count existing responses BEFORE submitting.
   */
  const before = getResponseState(tab).count;

  debug("Assistant messages before:", before);

  /*
   * Genuine Cmd+V + Return.
   */
  await pasteAndSend(prompt);

  let submitted = await waitForSubmission(tab, before);

  /*
   * If Enter didn't submit for some reason,
   * click ChatGPT's Send button while tab is
   * still foregrounded.
   */
  if (!submitted) {
    debug("Enter did not submit; trying Send button");

    const result = clickSendButton(tab);

    if (!result.clicked) {
      restoreApp(previousApp);

      throw new Error(
        "Prompt was pasted but could not be submitted."
      );
    }

    await sleep(250);
  }

  /*
   * Prompt is now safely submitted.
   *
   * Return keyboard/window focus immediately.
   */
  restoreApp(previousApp);

  debug("Restored previous app");

  /*
   * ChatGPT can generate while Chrome is behind.
   */
  const response = await waitForResponse(
    tab,
    before
  );

  process.stdout.write(response);

  if (!response.endsWith("\n")) {
    process.stdout.write("\n");
  }
}

main().catch(error => {
  console.error(`prompt-gpt: ${error.message}`);
  process.exit(1);
});