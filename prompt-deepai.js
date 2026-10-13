const { execSync } = require("child_process");

const prompt = process.argv[2];
if (!prompt) process.exit(1);

process.env.OUTPUT_FORMAT = "json";

let tabs = JSON.parse(execSync("chrome-cli list tabs")).tabs;
let deepaiTab = tabs.find((tab) => tab.url.startsWith("https://deepai.org/chat"));

let tabInfo;
if (deepaiTab) {
  execSync(`chrome-cli open 'https://deepai.org/chat' -t ${deepaiTab.id}`);
  tabInfo = JSON.parse(execSync(`chrome-cli info -t ${deepaiTab.id}`));
} else {
  tabInfo = JSON.parse(execSync("chrome-cli open 'https://deepai.org/chat'"));
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
        editor = document.querySelector('textarea#chatBox') ||
                 document.querySelector('textarea[placeholder*="Chat"]') ||
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

      let submitBtn = document.querySelector('button#chatBtn') ||
                        document.querySelector('button[type="submit"]');

      if (submitBtn && !submitBtn.disabled) {
        submitBtn.click();
      } else {
        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      }
    })(${JSON.stringify(prompt)});
  `;

  const encodedCode = Buffer.from(pageCode).toString("base64");
  execSync(`chrome-cli execute 'eval(atob("${encodedCode}"))' -t ${tabInfo.id}`);
}