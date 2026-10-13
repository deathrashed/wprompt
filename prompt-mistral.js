const { execSync } = require("child_process");

const prompt = process.argv[2];
if (!prompt) process.exit(1);

process.env.OUTPUT_FORMAT = "json";

let tabs = JSON.parse(execSync("chrome-cli list tabs")).tabs;
let mistralTab = tabs.find((tab) => tab.url.startsWith("https://chat.mistral.ai/"));

let tabInfo;
if (mistralTab) {
  execSync(`chrome-cli open 'https://chat.mistral.ai/chat/' -t ${mistralTab.id}`);
  tabInfo = JSON.parse(execSync(`chrome-cli info -t ${mistralTab.id}`));
} else {
  tabInfo = JSON.parse(execSync("chrome-cli open 'https://chat.mistral.ai/chat/'"));
}

try { execSync(`chrome-cli activate -t ${tabInfo.id}`); } catch {}

let interval = setInterval(() => {
  tabInfo = JSON.parse(execSync(`chrome-cli info -t ${tabInfo.id}`));
  if (!tabInfo.loading) {
    clearInterval(interval);
    executeScript();
  }
}, 200);

function executeScript() {
  const pageCode = `
    (async function(textToSend) {
      const sleep = ms => new Promise(r => setTimeout(r, ms));

      let editor = null;
      // Increased polling duration (up to 20s) to wait for Mistral SPA render
      for (let i = 0; i < 100; i++) {
        editor = document.querySelector('textarea[placeholder*="Ask"]') ||
                 document.querySelector('textarea[placeholder*="Message"]') ||
                 document.querySelector('textarea[name="prompt"]') ||
                 document.querySelector('textarea') ||
                 document.querySelector('div[contenteditable="true"]');
        if (editor) break;
        await sleep(200);
      }
      if (!editor) return;

      editor.focus();
      editor.click();
      await sleep(150);

      if (editor.tagName === 'TEXTAREA') {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        nativeSetter.call(editor, textToSend);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      if (!editor.value && editor.tagName === 'TEXTAREA') {
        document.execCommand('insertText', false, textToSend);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (editor.tagName !== 'TEXTAREA') {
        document.execCommand('insertText', false, textToSend);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }

      await sleep(400);

      let submitBtn = document.querySelector('button[type="submit"]') ||
                        document.querySelector('button[aria-label*="Send"]') ||
                        document.querySelector('button[class*="send"]') ||
                        document.querySelector('button:has(svg)');

      if (submitBtn && !submitBtn.disabled) {
        submitBtn.click();
      } else {
        const enterInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        editor.dispatchEvent(new KeyboardEvent('keydown', enterInit));
        editor.dispatchEvent(new KeyboardEvent('keyup', enterInit));
      }
    })(${JSON.stringify(prompt)});
  `;

  const encodedCode = Buffer.from(pageCode).toString("base64");
  execSync(`chrome-cli execute 'eval(atob("${encodedCode}"))' -t ${tabInfo.id}`);
}