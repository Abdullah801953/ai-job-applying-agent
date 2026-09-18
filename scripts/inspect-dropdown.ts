import 'dotenv/config';
import { chromium, Page, ElementHandle } from 'playwright';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const AGENT_DATA = 'C:\\Users\\dell\\Desktop\\job apply ai agent\\.agent-chrome-profile';

(async () => {
  const context = await chromium.launchPersistentContext(AGENT_DATA, {
    headless: false,
    executablePath: CHROME_PATH,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  await new Promise(r => setTimeout(r, 2000));
  const page = context.pages()[0];
  await page.goto('https://www.linkedin.com/jobs/search/?keywords=Full%20Stack%20Engineer&f_AL=true', {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await new Promise(r => setTimeout(r, 8000));

  const card = await page.$('.job-card-container');
  await card?.click();
  await new Promise(r => setTimeout(r, 4000));
  const btn = await page.$('button.jobs-apply-button');
  if (btn && /easy\s*apply/i.test(await btn.innerText())) {
    await btn.evaluate((el: Element) => (el as HTMLElement).click());
    await new Promise(r => setTimeout(r, 5000));

    // Click Next a few times to reach Additional Questions
    for (let k = 0; k < 5; k++) {
      const nxt = await page.$('button[aria-label="Continue to next step"], button:has-text("Next")');
      if (!nxt) break;
      await nxt.evaluate((el: Element) => (el as HTMLElement).click());
      await new Promise(r => setTimeout(r, 4000));
    }

    const modal = await page.$('[role="dialog"]');
    if (modal) {
      console.log('=== MODAL TEXT ===');
      console.log((await modal.innerText()).slice(0, 800));

      const selects = await page.$$eval('[role="dialog"] select', (els: HTMLSelectElement[]) =>
        els.map(s => ({
          id: s.id,
          label: s.closest('.fb-dash-form-element, .jobs-easy-apply-form-element, [class*="form-element"]')?.querySelector('label')?.innerText || s.getAttribute('aria-label'),
          ariaLabel: s.getAttribute('aria-label'),
          cls: s.className.slice(0, 50),
          options: Array.from(s.options).map(o => o.text.trim()).slice(0, 6),
          selectedText: s.options[s.selectedIndex]?.text,
          display: getComputedStyle(s).display,
          visibility: getComputedStyle(s).visibility,
        })),
      );
      console.log('=== NATIVE SELECTS ===');
      console.log(JSON.stringify(selects, null, 2));
    }
  }
  await new Promise(r => setTimeout(r, 2000));
  await context.close();
})().catch(e => { console.error('ERR', e instanceof Error ? e.message : String(e)); process.exit(1); });