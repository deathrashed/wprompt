const { execSync } = require("child_process");

const prompt = process.argv[2];
if (!prompt) process.exit(1);

process.env.OUTPUT_FORMAT = "json";

let tabs = JSON.parse(execSync("chrome-cli list tabs")).tabs;
let chatGptTab = tabs.find((tab) => tab.url.startsWith("https://chatgpt.com/"));

let tabInfo;
if (chatGptTab) {
  execSync(`chrome-cli open 'https://chatgpt.com/' -t ${chatGptTab.id}`);
  tabInfo = JSON.parse(execSync(`chrome-cli info -t ${chatGptTab.id}`));
} else {
  tabInfo = JSON.parse(execSync("chrome-cli open 'https://chatgpt.com/'"));
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
        editor = document.querySelector('#prompt-textarea') ||
                 document.querySelector('div[contenteditable="true"]');
        if (editor) break;
        await sleep(200);
      }
      if (!editor) return;

      editor.focus();
      if (editor.tagName === 'TEXTAREA') {
        editor.value = textToSend;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        document.execCommand('insertText', false, textToSend);
      }
      await sleep(300);

      let submitBtn = document.querySelector('button[data-testid="send-button"]') ||
                        document.querySelector('button[aria-label*="Send"]');

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