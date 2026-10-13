const { execSync } = require("child_process");

const prompt = process.argv[2];
if (!prompt) process.exit(1);

process.env.OUTPUT_FORMAT = "json";

const encodedPrompt = encodeURIComponent(prompt);
const targetUrl = `https://search.brave.com/ask?q=${encodedPrompt}`;

let tabs = JSON.parse(execSync("chrome-cli list tabs")).tabs;
let braveTab = tabs.find((tab) => tab.url.includes("search.brave.com"));

let tabInfo;
if (braveTab) {
  execSync(`chrome-cli open '${targetUrl}' -t ${braveTab.id}`);
  tabInfo = JSON.parse(execSync(`chrome-cli info -t ${braveTab.id}`));
} else {
  tabInfo = JSON.parse(execSync(`chrome-cli open '${targetUrl}'`));
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
      for (let i = 0; i < 30; i++) {
        editor = document.querySelector('textarea[placeholder*="Ask"]') ||
                 document.querySelector('textarea[name="q"]') ||
                 document.querySelector('input[name="q"]');
        if (editor) break;
        await sleep(200);
      }
      if (!editor) return;

      if (!editor.value) {
        editor.focus();
        document.execCommand('insertText', false, textToSend);
        await sleep(200);

        let submitBtn = document.querySelector('button[type="submit"]') ||
                          document.querySelector('button[aria-label*="Search"]');
        if (submitBtn) {
          submitBtn.click();
        } else {
          editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
        }
      }
    })(${JSON.stringify(prompt)});
  `;

  const encodedCode = Buffer.from(pageCode).toString("base64");
  execSync(`chrome-cli execute 'eval(atob("${encodedCode}"))' -t ${tabInfo.id}`);
}