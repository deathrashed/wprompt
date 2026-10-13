const { execSync } = require("child_process");

const prompt = process.argv[2];
if (!prompt) process.exit(1);

process.env.OUTPUT_FORMAT = "json";

let tabs = JSON.parse(execSync("chrome-cli list tabs")).tabs;
let geminiTab = tabs.find((tab) => tab.url.startsWith("https://gemini.google.com/"));

let tabInfo;
if (geminiTab) {
  execSync(`chrome-cli open 'https://gemini.google.com/app' -t ${geminiTab.id}`);
  tabInfo = JSON.parse(execSync(`chrome-cli info -t ${geminiTab.id}`));
} else {
  tabInfo = JSON.parse(execSync("chrome-cli open 'https://gemini.google.com/app'"));
}

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
        editor = document.querySelector('.ql-editor[contenteditable="true"]') ||
                 document.querySelector('p[data-placeholder]') ||
                 document.querySelector('div[contenteditable="true"]');
        if (editor) break;
        await sleep(200);
      }
      if (!editor) return;

      editor.focus();
      document.execCommand('insertText', false, textToSend);
      await sleep(300);

      let submitBtn = document.querySelector('button.send-button') ||
                        document.querySelector('button[aria-label*="Send"]') ||
                        document.querySelector('.send-button-container button');

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