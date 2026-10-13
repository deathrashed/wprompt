const { execSync } = require("child_process");

const prompt = process.argv[2];
if (!prompt) process.exit(1);

process.env.OUTPUT_FORMAT = "json";

let tabs = JSON.parse(execSync("chrome-cli list tabs")).tabs;
let qwenTab = tabs.find((tab) => tab.url.includes("qwen.ai"));

let tabInfo;
if (qwenTab) {
  execSync(`chrome-cli open 'https://chat.qwen.ai/' -t ${qwenTab.id}`);
  tabInfo = JSON.parse(execSync(`chrome-cli info -t ${qwenTab.id}`));
} else {
  tabInfo = JSON.parse(execSync("chrome-cli open 'https://chat.qwen.ai/'"));
}

try { execSync(`chrome-cli activate -t ${tabInfo.id}`); } catch {}

// Wait for browser loading state, then give SPA 1.5s to hydrate React elements
let interval = setInterval(() => {
  tabInfo = JSON.parse(execSync(`chrome-cli info -t ${tabInfo.id}`));
  if (!tabInfo.loading) {
    clearInterval(interval);
    setTimeout(executeScript, 1500);
  }
}, 200);

function executeScript() {
  const pageCode = `
    (async function(textToSend) {
      const sleep = ms => new Promise(r => setTimeout(r, ms));

      // Wait up to 30 seconds for Qwen interface elements to mount
      let editor = null;
      for (let i = 0; i < 150; i++) {
        editor = document.querySelector('textarea') ||
                 document.querySelector('#qwen-chat-input') ||
                 document.querySelector('div[contenteditable="true"]');
        if (editor) break;
        await sleep(200);
      }

      if (!editor) {
        console.error("Qwen input element not found.");
        return;
      }

      editor.focus();
      editor.click();
      await sleep(200);

      // Set value via prototype descriptor for React binding
      if (editor.tagName === 'TEXTAREA') {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        nativeSetter.call(editor, textToSend);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Secondary input injection to ensure state updates
      document.execCommand('insertText', false, textToSend);
      editor.dispatchEvent(new Event('input', { bubbles: true }));

      await sleep(500);

      // Attempt submit via send button
      let submitBtn = document.querySelector('button[type="submit"]') ||
                        document.querySelector('button[aria-label*="Send"]') ||
                        document.querySelector('button[class*="send"]') ||
                        document.querySelector('button:has(svg)');

      if (submitBtn && !submitBtn.disabled) {
        submitBtn.click();
      }

      // Fallback: Full Enter key dispatch sequence
      await sleep(200);
      const enterEvt = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      editor.dispatchEvent(new KeyboardEvent('keydown', enterEvt));
      editor.dispatchEvent(new KeyboardEvent('keyup', enterEvt));
    })(${JSON.stringify(prompt)});
  `;

  const encodedCode = Buffer.from(pageCode).toString("base64");
  execSync(`chrome-cli execute 'eval(atob("${encodedCode}"))' -t ${tabInfo.id}`);
}