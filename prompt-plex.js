#!/usr/bin/env node

const { execSync } = require("child_process");

const prompt = process.argv.slice(2).join(" ");
if (!prompt) {
  console.error("Usage: prompt-perplexity.js 'your prompt'");
  process.exit(1);
}

process.env.OUTPUT_FORMAT = "json";

function sh(cmd) {
  return execSync(cmd, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function chromeEval(tabId, code) {
  const encoded = Buffer.from(code).toString("base64");

  const raw = sh(
    `chrome-cli execute 'eval(atob("${encoded}"))' -t ${tabId}`
  );

  try {
    const parsed = JSON.parse(raw);

    // chrome-cli may wrap JS result
    return parsed.result ?? parsed.value ?? parsed;
  } catch {
    return raw;
  }
}

// ------------------------------------------------------------
// Open/reuse Perplexity
// ------------------------------------------------------------

let tabs = JSON.parse(sh("chrome-cli list tabs")).tabs;

let tab = tabs.find(t =>
  t.url.startsWith("https://www.perplexity.ai/")
);

let tabInfo;

if (tab) {
  sh(`chrome-cli open 'https://www.perplexity.ai/' -t ${tab.id}`);
  tabInfo = JSON.parse(sh(`chrome-cli info -t ${tab.id}`));
} else {
  tabInfo = JSON.parse(
    sh("chrome-cli open 'https://www.perplexity.ai/'")
  );
}

const tabId = tabInfo.id;

// ------------------------------------------------------------
// Wait for page
// ------------------------------------------------------------

for (let i = 0; i < 100; i++) {
  const info = JSON.parse(sh(`chrome-cli info -t ${tabId}`));

  if (!info.loading) break;

  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(4)),
    0,
    0,
    200
  );
}

// ------------------------------------------------------------
// Submit prompt
// ------------------------------------------------------------

const submitCode = `
(async function(prompt) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let editor = null;

  for (let i = 0; i < 50; i++) {
    editor =
      document.querySelector('textarea[placeholder*="Ask"]') ||
      document.querySelector('textarea') ||
      document.querySelector('[contenteditable="true"]');

    if (editor) break;
    await sleep(200);
  }

  if (!editor) return "ERROR: input not found";

  editor.focus();
  editor.click();

  if (editor.tagName === "TEXTAREA") {
    const setter =
      Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      ).set;

    setter.call(editor, prompt);

    editor.dispatchEvent(
      new Event("input", { bubbles: true })
    );

    editor.dispatchEvent(
      new Event("change", { bubbles: true })
    );
  } else {
    editor.textContent = "";
    document.execCommand("insertText", false, prompt);
  }

  await sleep(300);

  const button =
    document.querySelector('button[aria-label*="Submit"]') ||
    document.querySelector('button[aria-label*="Send"]') ||
    document.querySelector('button[type="submit"]');

  if (button && !button.disabled) {
    button.click();
  } else {
    editor.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true
      })
    );
  }

  return "OK";
})(${JSON.stringify(prompt)})
`;

chromeEval(tabId, submitCode);

// ------------------------------------------------------------
// Wait for response
// ------------------------------------------------------------

let previous = "";
let stableCount = 0;
let finalText = "";

for (let i = 0; i < 300; i++) {
  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(4)),
    0,
    0,
    500
  );

  const readCode = `
(() => {
  const candidates = [
    ...document.querySelectorAll(
      '[class*="prose"], .prose, [class*="answer"], [class*="response"]'
    )
  ];

  const texts = candidates
    .map(el => (el.innerText || "").trim())
    .filter(Boolean);

  if (!texts.length) return "";

  return texts[texts.length - 1];
})()
`;

  let text = chromeEval(tabId, readCode);

  if (typeof text !== "string") {
    text = String(text ?? "");
  }

  text = text.trim();

  if (!text) continue;

  if (text === previous) {
    stableCount++;
  } else {
    stableCount = 0;
    previous = text;
  }

  finalText = text;

  // unchanged for ~3 sec = probably finished
  if (stableCount >= 6) break;
}

if (!finalText) {
  console.error("No Perplexity response found.");
  process.exit(2);
}

// stdout
process.stdout.write(finalText + "\n");