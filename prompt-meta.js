const { execSync } = require("child_process");

const prompt = process.argv[2];
if (!prompt) process.exit(1);

process.env.OUTPUT_FORMAT = "json";

let tabs = JSON.parse(execSync("chrome-cli list tabs")).tabs;
let metaTab = tabs.find((tab) => tab.url.startsWith("https://www.meta.ai/"));

let tabInfo;
if (metaTab) {
  execSync(`chrome-cli open 'https://www.meta.ai/' -t ${metaTab.id}`);
  tabInfo = JSON.parse(execSync(`chrome-cli info -t ${metaTab.id}`));
} else {
  tabInfo = JSON.parse(execSync("chrome-cli open 'https://www.meta.ai/'"));
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
        editor = document.querySelector('div[contenteditable="true"]') ||
                 document.querySelector('textarea');
        if (editor) break;
        await sleep(200);
      }
      if (!editor) return;

      editor.focus();
      document.execCommand('insertText', false, textToSend);

      await sleep(300);

      let submitBtn = document.querySelector('button[aria-label*="Send"]') ||
                        document.querySelector('div[aria-label*="Send"]') ||
                        document.querySelector('button[type="submit"]');

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