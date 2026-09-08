require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { answerQuestion, pickOption } = require('./ai-solver');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const AGENT_DATA = path.join(__dirname, '..', '.agent-chrome-profile');
const DATA_DIR = path.join(__dirname, '..', 'data');
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

function loadResume() {
  const p = path.join(DATA_DIR, 'resume.txt');
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  return 'No resume provided.';
}

const waitFor = (ms) => new Promise(r => setTimeout(r, ms));

function stopableWait(ms, stopSignal) {
  return new Promise(resolve => {
    const step = 300;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += step;
      if (elapsed >= ms || (stopSignal && stopSignal.stopped)) {
        clearInterval(timer);
        resolve();
      }
    }, step);
  });
}

function makeAbortController(stopSignal) {
  const controller = new AbortController();
  if (stopSignal) {
    const check = setInterval(() => {
      if (stopSignal.stopped) {
        clearInterval(check);
        controller.abort();
      }
    }, 200);
    controller._clearWatches = () => clearInterval(check);
  }
  return controller;
}

async function runAgent(options = {}) {
  const {
    keywords = 'Full Stack Engineer',
    remote = true,
    maxApplications = 10,
  } = options;

  const emit = options.onLog || (() => {});
  const log = (msg, type = 'info') => emit({ type, message: msg, time: Date.now() });
  const stopSignal = options.stopSignal || null;

  const userResumeText = loadResume();

  log('Launching Chrome (dedicated agent profile)...');
  const context = await chromium.launchPersistentContext(AGENT_DATA, {
    headless: false,
    slowMo: 100,
    executablePath: CHROME_PATH,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });

  await waitFor(2000);
  const page = context.pages()[0];
  if (!page) {
    log('No page available in browser context.', 'error');
    await context.close();
    return { applied: 0 };
  }

  const keywordQuery = encodeURIComponent(keywords);
  const remoteFilter = remote ? '&f_AL=true' : '';
  const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${keywordQuery}${remoteFilter}`;
  log('Opening LinkedIn job search...');
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  let loggedIn = false;
  for (let i = 0; i < 30 && !loggedIn; i++) {
    await page.waitForTimeout(3000);
    if (stopSignal && stopSignal.stopped) {
      log('Agent stopped during login. Closing Chrome.', 'warn');
      await context.close();
      return { applied: 0 };
    }
    const url = await page.url();
    const loginForm = await page.$('form.login__form, #session_key, .authwall-join-form');

    if (loginForm || url.includes('/login') || url.includes('authwall') || url.includes('checkpoint')) {
      log('LinkedIn login required. Please login in the Chrome window...', 'warn');
    } else if (url.includes('/jobs')) {
      loggedIn = true;
      log('Logged in and on the jobs search page.');
    } else {
      log(`Current page: ${url} — waiting for login/jobs...`);
    }
  }
  if (!loggedIn) {
    log('Still not logged in after retries. Aborting.', 'error');
    await context.close();
    return { applied: 0 };
  }

  log('Logged in. Loading job list...');
  await page.waitForTimeout(4000);
  await page.waitForSelector('.job-card-container, li.jobs-search-results__list-item, .scaffold-layout__list-pane', { timeout: 30000, state: 'visible' })
    .catch(() => log('Job list pane not detected immediately, continuing anyway...', 'warn'));

  let appliedCount = 0;
  await page.mouse.move(400, 300);
  await page.waitForTimeout(1000);

  const totalCards = (await page.$$('.job-card-container, li.jobs-search-results__list-item')).length;
  const logCards = await page.$('.job-card-container');
  log(`${logCards ? 'Using .job-card-container' : 'Using list-item'} selector. Total job cards: ${totalCards}. Starting applications (max ${maxApplications}).`);

  if (totalCards === 0) {
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'debug-page.html'), await page.content());
    log('No job cards found. Saved page HTML to debug-page.html for inspection.', 'error');
  }

  let i = 0;
  while (i < totalCards && appliedCount < maxApplications && !(stopSignal && stopSignal.stopped)) {
    i++;
    try {
      const sel = '.job-card-container';
      const card = await page.$(`${sel}, li.jobs-search-results__list-item`);
      if (!card) {
        log(`Job #${i}: no card found, skipping.`, 'warn');
        break;
      }

      const jobIdBefore = await page.evaluate(() => new URLSearchParams(location.search).get('currentJobId')).catch(() => null);
      await card.scrollIntoViewIfNeeded().catch(() => {});
      await card.click({ timeout: 8000 }).catch(() => {});
      await stopableWait(4500, stopSignal);
      if (stopSignal && stopSignal.stopped) break;

      const jobIdAfter = await page.evaluate(() => new URLSearchParams(location.search).get('currentJobId')).catch(() => null);
      if ((jobIdBefore && jobIdAfter) && jobIdBefore === jobIdAfter) {
        const tile = await page.$('.job-card-container, li.jobs-search-results__list-item');
        const titleLink = tile ? await tile.$('a[href*="/jobs/"], a.job-card-container__link, a[data-tracking-control-name*="job-card"]') : null;
        if (titleLink) {
          log(`Job #${i}: pane did not switch on card click, clicking title link once...`, 'warn');
          await titleLink.click({ timeout: 5000 }).catch(() => {});
          await stopableWait(4500, stopSignal);
          if (stopSignal && stopSignal.stopped) break;
        }
      }

      const modalOpened = await openEasyApply(page, log, stopSignal);
      if (modalOpened) {
        log(`Job #${i}: Easy Apply modal open.`);
        const result = await handleApplicationForm(page, userResumeText, log, stopSignal);
        if (result) {
          appliedCount++;
          log(`Job #${i}: Application submitted (${appliedCount}/${maxApplications}).`, 'success');
        } else {
          if (stopSignal && stopSignal.stopped) {
            log('Job #' + i + ': Stopped by user.', 'warn');
          } else {
            log(`Job #${i}: Form closed/unsuccessful.`);
          }
        }
      } else {
        if (stopSignal && stopSignal.stopped) {
          log('Agent stopped by user.', 'warn');
        } else {
          log(`Job #${i}: No modal Easy Apply (only external "Apply"), skipping.`);
        }
      }
      await page.waitForTimeout(800);
      await page.keyboard.press('Escape').catch(() => {});
      await stopableWait(2500, stopSignal);
      await page.keyboard.press('Escape').catch(() => {});
      await stopableWait(1500, stopSignal);
      const successToast = await page.$('.artdeco-toast-item, [data-test-id="toast-card"], .artdeco-modal');
      if (successToast) {
        await page.keyboard.press('Escape').catch(() => {});
        await stopableWait(1500, stopSignal);
      }
    } catch (err) {
      log(`Job #${i}: Error - ${err.message}`, 'error');
    }
  }

  if (stopSignal && stopSignal.stopped) {
    log('Agent stopped by user. Closing Chrome.', 'warn');
  } else {
    log('Agent run finished.');
  }
  await context.close();
  return { applied: appliedCount };
}

async function findEasyApplyButton(page) {
  const detailScope = await page.$('.jobs-details__main-content, .jobs-details__main-card, .job-view-layout');
  const scopeSelector = 'button.jobs-apply-button, [data-test-id="apply-button"], button[aria-label*="Easy Apply"]';

  if (detailScope) {
    const scoped = await detailScope.$$(scopeSelector);
    for (const btn of scoped) {
      const visible = await btn.isVisible().catch(() => false);
      if (!visible) continue;
      const text = (await btn.innerText().catch(() => '')).trim();
      if (/easy\s*apply/i.test(text)) return btn;
    }
  }

  const allBtns = await page.$$('button.jobs-apply-button, [data-test-id="apply-button"]');
  for (const btn of allBtns) {
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) continue;
    const text = (await btn.innerText().catch(() => '')).trim();
    if (/easy\s*apply/i.test(text)) return btn;
  }

  const topCard = await page.$('.jobs-apply-button--top-card button, .jobs-details__main-content button[aria-label^="Easy Apply"]');
  if (topCard) {
    const text = (await topCard.innerText().catch(() => '')).trim();
    if (/easy\s*apply/i.test(text)) return topCard;
  }

  const labelBtn = await page.$('button[aria-label*="Easy Apply"]');
  if (labelBtn && await labelBtn.isVisible().catch(() => false)) return labelBtn;

  return null;
}

async function openEasyApply(page, log, stopSignal) {
  const modalSel = '.jobs-easy-apply-modal, .jobs-easy-apply-modal__content, [role="dialog"], .jobs-modal__content, #jobs-apply-header';
  for (let attempt = 0; attempt < 4; attempt++) {
    if (stopSignal && stopSignal.stopped) return false;
    const btn = await findEasyApplyButton(page);
    if (!btn) {
      log('  No Easy Apply button on the page.', 'warn');
      return false;
    }
    try {
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await btn.click({ timeout: 5000 }).catch(() => {});
    } catch {}
    await stopableWait(2500, stopSignal);
    if (await page.$(modalSel)) {
      return true;
    }
    log(`  Easy Apply click attempt ${attempt + 1} — modal not open, retrying...`, 'warn');
    await btn.evaluate(el => el.click()).catch(() => {});
    await stopableWait(2500, stopSignal);
    if (await page.$(modalSel)) {
      return true;
    }
  }
  return false;
}

async function handleApplicationForm(page, userResumeText, log, stopSignal) {
  let submitted = false;
  let steps = 0;

  while (steps < 20 && !(stopSignal && stopSignal.stopped)) {
    steps++;
    if (stopSignal && stopSignal.stopped) {
      log('Stop requested during form fill. Closing modal.', 'warn');
      await page.keyboard.press('Escape').catch(() => {});
      break;
    }
    let modal = await page.$('.jobs-easy-apply-modal, .jobs-easy-apply-modal__content, [role="dialog"], .jobs-modal__content, #jobs-apply-header');

    let waited = 0;
    while (!modal && waited < 15000 && !(stopSignal && stopSignal.stopped)) {
      await stopableWait(1500, stopSignal);
      waited += 1500;
      modal = await page.$('.jobs-easy-apply-modal, .jobs-easy-apply-modal__content, [role="dialog"], .jobs-modal__content, #jobs-apply-header');
    }

    if (stopSignal && stopSignal.stopped) {
      log('Stop requested during modal wait.', 'warn');
      break;
    }

    if (!modal) {
      log('Easy Apply modal not on screen — skipping this job.');
      try {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `debug-modal-${Date.now()}.png`) });
        const url = page.url();
        log(`  URL: ${url}`, 'warn');
        const btnText = await page.evaluate(() => {
          const b = document.querySelector('button.jobs-apply-button, [data-test-id="apply-button"], .jobs-apply-button--top-card button');
          return b ? b.innerText.slice(0, 40) : 'none';
        }).catch(() => 'unknown');
        log(`  Apply button text now: ${btnText}`, 'warn');
      } catch (e) { log(`  Diag failed: ${e.message}`, 'warn'); }
      break;
    }

    await fillVisibleQuestions(page, userResumeText, log, stopSignal);
    if (stopSignal && stopSignal.stopped) {
      log('Stop requested during form fill.', 'warn');
      await page.keyboard.press('Escape').catch(() => {});
      break;
    }

    const getProgress = async () => {
      try {
        const bar = await page.$('progress[class*="completeness"], .artdeco-completeness-meter-linear__progress-element');
        return bar ? await bar.getAttribute('value') || await bar.evaluate(el => el.value) : null;
      } catch { return null; }
    };

    const dumpModal = async (why) => {
      const diag = await page.evaluate(() => {
        const modal = document.querySelector('.jobs-easy-apply-modal, [role="dialog"]');
        if (!modal) return 'no modal text';
        const fields = [...modal.querySelectorAll('input, select, textarea, [contenteditable="true"]')]
          .filter(el => el.type !== 'hidden' && getComputedStyle(el).display !== 'none')
          .slice(0, 15)
          .map(el => {
            const wrap = el.closest('.fb-dash-form-element, .jobs-easy-apply-form-element, [class*="form-element"]');
            const label = el.getAttribute('aria-label') ||
              el.getAttribute('placeholder') ||
              (wrap?.querySelector('label')?.innerText || '').trim();
            const hasErr = !!(wrap?.querySelector('[class*="error"], .artdeco-inline-feedback'));
            return {
              label: label || '',
              tag: el.tagName,
              type: el.type || el.getAttribute('contenteditable') || '',
              value: (el.value || el.innerText || '').trim().slice(0, 60),
              disabled: !!el.disabled,
              err: hasErr,
            };
          });
        const msg = modal.querySelector('.artdeco-inline-feedback, [class*="error"][class*="form"]');
        return { fields, errText: msg ? msg.innerText.slice(0, 150) : '' };
      });
      const fieldReport = diag.fields.map(f => `${f.label||'(no-label)'}[${f.tag}/${f.type}]="${f.value||''}"${f.err?'[ERR]':''}`).join(' | ');
      log(`  DIAG(${why}): ${fieldReport}${diag.errText ? ' MSG:' + diag.errText : ''}`, 'warn');
    };

    const progressBefore = await getProgress();
    const submitBtn = await page.$('button[aria-label="Submit application"], button:has-text("Submit application"), button:has-text("Submit")');
    const reviewBtn = await page.$('button[aria-label="Review your application"], button:has-text("Review")');
    const nextBtn = await page.$('button[aria-label="Continue to next step"], button:has-text("Next"), footer button[type="submit"]:has-text("Next")');

    const enabled = async (btn) => {
      if (!btn) return false;
      return await btn.isEnabled().catch(() => true);
    };

    if (submitBtn && await enabled(submitBtn)) {
      log('Submitting application...', 'success');
      await submitBtn.click().catch(async () => submitBtn.evaluate(el => el.click()));
      if (stopSignal && stopSignal.stopped) { await page.keyboard.press('Escape').catch(() => {}); break; }
      await waitFor(3000);
      submitted = true;
      break;
    } else if (reviewBtn && await enabled(reviewBtn)) {
      log('Clicking Review...');
      await reviewBtn.click().catch(async () => reviewBtn.evaluate(el => el.click()));
      if (stopSignal && stopSignal.stopped) { await page.keyboard.press('Escape').catch(() => {}); break; }
      await waitFor(2000);
      const progressAfter = await getProgress();
      if (progressAfter && progressBefore && progressAfter === progressBefore) {
        log('  Review did not advance — required field(s) likely invalid.', 'warn');
        await dumpModal('review');
      }
      continue;
    } else if (nextBtn && await enabled(nextBtn)) {
      log('Clicking Next...');
      await nextBtn.click().catch(async () => nextBtn.evaluate(el => el.click()));
      if (stopSignal && stopSignal.stopped) { await page.keyboard.press('Escape').catch(() => {}); break; }
      await waitFor(2000);
      const progressAfter = await getProgress();
      if (progressAfter && progressBefore && progressAfter === progressBefore) {
        log('  Step did not advance — a required field may be incomplete.', 'warn');
        await dumpModal('next');
      }
      continue;
    } else {
      const anySubmit = await page.$('button[aria-label*="Submit"], button:has-text("Submit application")');
      if (anySubmit && await enabled(anySubmit)) {
        log('Submitting application...', 'success');
        await anySubmit.click().catch(async () => anySubmit.evaluate(el => el.click()));
        await waitFor(3000);
        submitted = true;
        break;
      }
      log('No enabled action button found on this step.');
      break;
    }
  }

  if (submitted) {
    const closeBtn = await page.$('button[aria-label="Dismiss"], button[aria-label="Close"], .artdeco-modal__dismiss');
    if (closeBtn) await closeBtn.click().catch(() => {});
  }
  return submitted;
}

async function fillVisibleQuestions(page, userResumeText, log, stopSignal) {
  const fields = await page.$$('[role="dialog"] select, [role="dialog"] textarea, [role="dialog"] input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]):not([type="submit"]), .jobs-easy-apply-form-section, [class*="fb-dash"] textarea, [class*="fb-dash"] input, [class*="fb-dash"] select');
  const abortController = makeAbortController(stopSignal);
  try {
  log(`  Fill pass: found ${fields.length} fields (${(await page.$$('[role="dialog"] select')).length} selects).`);

  for (const field of fields) {
    if (stopSignal && stopSignal.stopped) return;
    const tag = await field.evaluate(el => el.tagName);
    const label = await field.evaluate(el => {
      const direct = el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
      if (direct) return direct;
      let wrap = el.closest('.jobs-easy-apply-form-element, .fb-dash-form-element, [class*="form-element"]');
      if (wrap) {
        const lbl = wrap.querySelector('label');
        if (lbl && lbl.innerText.trim()) return lbl.innerText.trim();
        const q = wrap.querySelector('[class*="label"], [class*="question"], [class*="title"], [class*="form-element__label"]');
        if (q && q.innerText.trim()) return q.innerText.trim();
      }
      const parentLabel = el.closest('label');
      if (parentLabel && parentLabel.innerText.trim()) return parentLabel.innerText.trim();
      const prev = el.previousElementSibling;
      if (prev && prev.innerText && prev.innerText.trim() && prev.tagName !== 'SELECT') return prev.innerText.trim().slice(0, 80);
      const row = el.closest('div');
      if (row) {
        const t = (row.innerText || '').trim();
        if (t && !/^select|^--/.test(t)) return t.slice(0, 80);
      }
      return '';
    });

    if (tag === 'SELECT') {
      try {
        const currentValue = await field.evaluate(el => el.value);
        const selText = await field.evaluate(el => el.options[el.selectedIndex]?.text || '');
        log(`  [select] label="${label||'(none)'}" selected="${selText}" options-count check on`);
        const options = await field.evaluate(el =>
          [...el.options]
            .map((o, idx) => ({ idx, text: o.text.trim(), value: o.value }))
            .filter(o => o.text && o.text.toLowerCase() !== 'select an option' && o.text !== '--' && !o.text.toLowerCase().includes('choose'))
        );

        const currentSelectedText = await field.evaluate(el => el.options[el.selectedIndex]?.text || '');
        if (currentSelectedText && !/select an option|please select|choose|^[-\s]*$/i.test(currentSelectedText.trim())) {
          continue;
        }

        if (options.length === 1) {
          await field.selectOption({ value: options[0].value }).catch(() => {});
          log(`Auto-selected lone option for: ${label || 'dropdown'}`);
        } else if (options.length > 1) {
          const question = label || 'dropdown option';
          const optionList = options.map(o => o.text);
          let picked = null;
          try {
            picked = await pickOption(question, optionList, abortController.signal);
          } catch (e) {
            log(`Option pick failed for "${question}": ${e.message}`, 'error');
          }
          const match = picked ? optionList.indexOf(picked) : -1;
          if (match >= 0) {
            await field.selectOption({ index: options[match].idx }).catch(() => {});
            log(`AI selected "${options[match].text}" for: ${question}`);
          } else {
            await field.selectOption({ index: options[0].idx }).catch(() => {});
            log(`AI suggestion unmatched, used "${options[0].text}" for: ${question}`, 'warn');
          }
        }
      } catch (e) {
        log(`Could not select dropdown "${label}": ${e.message}`, 'error');
      }
      continue;
    }

    const alreadyFilled = await field.evaluate(el => el.value && el.value.trim().length > 0);
    if (alreadyFilled || !label) continue;

    const type = await field.evaluate(el => el.type || '');
    if (type === 'file') continue;
    if (type === 'checkbox' || type === 'radio') {
      const name = await field.evaluate(el => el.name || '');
      const checked = await field.evaluate(el => el.checked);
      if (checked) continue;
      const group = await page.$$(`[role="dialog"] input[type="radio"], [role="dialog"] input[type="checkbox"], [class*="fb-dash"] input[type="radio"], [class*="fb-dash"] input[type="checkbox"]`);
      const sameGroup = [];
      for (const g of group) {
        const gName = await g.evaluate(el => el.name || '');
        if (gName && gName === name) sameGroup.push(g);
      }
      if (sameGroup.length === 0) continue;
      const optionLabels = [];
      for (const g of sameGroup) {
        const gLabel = await g.evaluate(el => {
          const wrap = el.closest('label, .fb-dash-form-element__radio-wrap, .fb-dash-form-element, [class*="radio"]');
          return wrap ? wrap.innerText.trim().slice(0, 40) : (el.value || '');
        });
        optionLabels.push(gLabel || g.value || '');
      }
      const question = label || 'this question';
      let picked = null;
      try {
        picked = await pickOption(question, optionLabels, abortController.signal);
      } catch (e) {
        log(`Radio pick failed for "${question}": ${e.message}`, 'error');
      }
      let chosen = picked ? sameGroup.find((g, idx) => optionLabels.some((l, li) => li === idx && l.toLowerCase() === picked.toLowerCase())) : null;
      if (!chosen) chosen = optionLabels.some(l => /^yes$/i.test(l)) ? sameGroup.find((g, idx) => /^yes$/i.test(optionLabels[idx])) : sameGroup[0];
      if (chosen) {
        await chosen.evaluate(el => el.click()).catch(() => {});
        log(`AI selected "${optionLabels[sameGroup.indexOf(chosen)] || 'Yes'}" for: ${question}`);
        await stopableWait(400, stopSignal);
      }
      continue;
    }
    if (type === 'date') {
      try {
        await field.fill('2026-01-01');
      } catch {}
      continue;
    }

    log(`AI answering: ${label}`);
    try {
      let answer = await answerQuestion(label, userResumeText, abortController.signal);
      const isNumericQuestion = /salary|ctc|lpa|inr|\busd\b|per annum|annual|compensation|expected|integer|whole numbers|how many years|years of experience|years of professional|years of hands-on|years of .*experience/i.test(label);
      if (type === 'number') {
        answer = (answer.match(/\d+(\.\d+)?/) || ['3'])[0];
      } else if (isNumericQuestion && !/describe|explain|elaborate|list/i.test(label)) {
        const num = answer.match(/\d+(\.\d+)?/);
        if (num) answer = num[0];
        else answer = '3';
      }
      await field.fill(answer);
      await stopableWait(600, stopSignal);
    } catch (e) {
      log(`Could not fill "${label}": ${e.message}`, 'error');
    }
  }
  } finally {
    if (abortController._clearWatches) abortController._clearWatches();
  }
}

module.exports = { runAgent, loadResume };

if (require.main === module) {
  runAgent().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
