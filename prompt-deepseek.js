const { execSync } = require("child_process");

const prompt = process.argv[2];
if (!prompt) process.exit(1);

process.env.OUTPUT_FORMAT = "json";

let tabs = JSON.parse(execSync("chrome-cli list tabs")).tabs;
let deepseekTab = tabs.find((tab) => tab.url.startsWith("https://chat.deepseek.com/"));

let tabInfo;
if (deepseekTab) {
  execSync(`chrome-cli open 'https://chat.deepseek.com/' -t ${deepseekTab.id}`);
  tabInfo = JSON.parse(execSync(`chrome-cli info -t ${deepseekTab.id}`));
} else {
  tabInfo = JSON.parse(execSync("chrome-cli open 'https://chat.deepseek.com/'"));
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
      for (let i = 0; i < 50; i++) {
        editor = document.querySelector('#chat-input') ||
                 document.querySelector('textarea[placeholder*="Message"]') ||
                 document.querySelector('textarea');
        if (editor) break;
        await sleep(200);
      }
      if (!editor) return;

      editor.focus();
      document.execCommand('insertText', false, textToSend);
      if (editor.tagName === 'TEXTAREA' && !editor.value) {
        editor.value = textToSend;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }

      await sleep(300);

      let submitBtn = document.querySelector('#chat-input-send-button') ||
                        document.querySelector('div[role="button"][aria-label*="Send"]') ||
                        document.querySelector('button[aria-label*="Send"]') ||
                        document.querySelector('div._send_button');

      if (submitBtn) {
        submitBtn.click();
      } else {
        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      }
    })(${JSON.stringify(prompt)});
  `;

  const encodedCode = Buffer.from(pageCode).toString("base64");
  execSync(`chrome-cli execute 'eval(atob("${encodedCode}"))' -t ${tabInfo.id}`);
}