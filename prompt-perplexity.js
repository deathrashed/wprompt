const { execSync } = require("child_process");

const prompt = process.argv[2];
if (!prompt) {
  console.error("Please provide a prompt argument.");
  process.exit(1);
}

process.env.OUTPUT_FORMAT = "json";

let tabs = JSON.parse(execSync("chrome-cli list tabs")).tabs;
let perplexityTab = tabs.find((tab) =>
  tab.url.startsWith("https://www.perplexity.ai/")
);

let tabInfo;
if (perplexityTab) {
  execSync(`chrome-cli open 'https://www.perplexity.ai/' -t ${perplexityTab.id}`);
  tabInfo = JSON.parse(execSync(`chrome-cli info -t ${perplexityTab.id}`));
} else {
  tabInfo = JSON.parse(
    execSync("chrome-cli open 'https://www.perplexity.ai/'")
  );
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
        editor = document.querySelector('textarea[placeholder*="Ask"]') ||
                 document.querySelector('textarea') ||
                 document.querySelector('[contenteditable="true"]');
        if (editor) break;
        await sleep(200);
      }
      if (!editor) {
        console.error("Perplexity input not found.");
        return;
      }

      editor.focus();
      editor.click();
      await sleep(100);

      // Force state update for React input component
      if (editor.tagName === 'TEXTAREA') {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        nativeSetter.call(editor, textToSend);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        document.execCommand('insertText', false, textToSend);
      }

      await sleep(300);

      // Submit via button or Enter key
      let submitBtn = document.querySelector('button[aria-label*="Submit"]') ||
                        document.querySelector('button[aria-label*="Send"]') ||
                        document.querySelector('button.bg-super') ||
                        document.querySelector('button[type="submit"]');

      if (submitBtn && !submitBtn.disabled) {
        submitBtn.click();
      } else {
        editor.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true
        }));
      }
    })(${JSON.stringify(prompt)});
  `;

  const encodedCode = Buffer.from(pageCode).toString("base64");
  execSync(`chrome-cli execute 'eval(atob("${encodedCode}"))' -t ${tabInfo.id}`);
}