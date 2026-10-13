const { execSync } = require("child_process");

const prompt = process.argv[2];
if (!prompt) process.exit(1);

process.env.OUTPUT_FORMAT = "json";

let tabs = JSON.parse(execSync("chrome-cli list tabs")).tabs;
let minimaxTab = tabs.find((tab) => tab.url.startsWith("https://agent.minimax.io/"));

let tabInfo;
if (minimaxTab) {
  execSync(`chrome-cli open 'https://agent.minimax.io/' -t ${minimaxTab.id}`);
  tabInfo = JSON.parse(execSync(`chrome-cli info -t ${minimaxTab.id}`));
} else {
  tabInfo = JSON.parse(execSync("chrome-cli open 'https://agent.minimax.io/'"));
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
        editor = document.querySelector('textarea[placeholder*="Enter message"]') ||
                 document.querySelector('textarea') ||
                 document.querySelector('div[contenteditable="true"]');
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

      let submitBtn = document.querySelector('button:has(svg)') ||
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