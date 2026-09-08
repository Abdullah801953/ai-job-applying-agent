// save-session.js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('https://www.linkedin.com/login');
  console.log('Kripya manual login karein, phir terminal me ENTER press karein...');
  
  process.stdin.once('data', async () => {
    await context.storageState({ path: require('path').join(__dirname, '..', 'data', 'state.json') });
    console.log('Session saved to data/state.json!');
    await browser.close();
    process.exit();
  });
})();