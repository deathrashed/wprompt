const { execSync } = require("child_process");

const prompt = process.argv[2];

if (!prompt) {
  console.error("Please provide a prompt argument.");
  process.exit(1);
}

process.env.OUTPUT_FORMAT = "json";

try {
  execSync("which chrome-cli");
} catch {
  console.error(
    "chrome-cli is required to run this script (https://github.com/prasmussen/chrome-cli)"
  );
  process.exit(1);
}

// Find existing Claude tab or open a new one
let tabs = JSON.parse(execSync("chrome-cli list tabs")).tabs;
let claudeTab = tabs.find((tab) => tab.url.startsWith("https://claude.ai/"));

let claudeTabInfo;
if (claudeTab) {
  execSync(`chrome-cli open 'https://claude.ai/new' -t ${claudeTab.id}`);
  claudeTabInfo = JSON.parse(execSync(`chrome-cli info -t ${claudeTab.id}`));
} else {
  claudeTabInfo = JSON.parse(
    execSync("chrome-cli open 'https://claude.ai/new'")
  );
}

// Wait for tab loading to finish
let interval = setInterval(() => {
  claudeTabInfo = JSON.parse(
    execSync(`chrome-cli info -t ${claudeTabInfo.id}`)
  );
  if (!claudeTabInfo.loading) {
    clearInterval(interval);
    executeScript();
  }
}, 200);

function executeScript() {
  // Client-side script injected into the page
  const pageCode = `
    (async function(textToSend) {
      function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

      // 1. Locate prompt editor (handles contenteditable div or fallback)
      let editor = null;
      for (let i = 0; i < 50; i++) {
        editor = document.querySelector('div[contenteditable="true"]') || 
                 document.querySelector('[aria-label*="Write your prompt"]');
        if (editor) break;
        await sleep(200);
      }

      if (!editor) {
        console.error("Claude prompt editor not found.");
        return;
      }

      // 2. Set content and dispatch events so React detects changes
      editor.focus();
      document.execCommand('insertText', false, textToSend);

      // Fallback input dispatch if execCommand isn't supported
      if (!editor.textContent.trim()) {
        editor.innerText = textToSend;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }

      await sleep(300);

      // 3. Locate submit button
      let submitBtn = null;
      for (let i = 0; i < 20; i++) {
        submitBtn = document.querySelector('button[aria-label*="Send"]') || 
                    document.querySelector('button:has(svg)');
        if (submitBtn && !submitBtn.disabled) break;
        await sleep(200);
      }

      if (submitBtn) {
        submitBtn.click();
      } else {
        // Fallback: press Enter key in editor
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

  // Safely encode to base64 to prevent shell escaping issues
  const encodedCode = Buffer.from(pageCode).toString("base64");
  const execCommand = `chrome-cli execute 'eval(atob("${encodedCode}"))' -t ${claudeTabInfo.id}`;

  try {
    execSync(execCommand);
  } catch (err) {
    console.error("Failed to execute script in browser tab:", err);
  }
}