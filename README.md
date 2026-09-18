# JobApply Agent

AI-powered LinkedIn Easy Apply automation agent. The agent opens your LinkedIn job search in a real Chrome window, walks through **Easy Apply** jobs, uses Groq (free LLM API) to answer application questions — text, numeric, dropdown, and radio fields — and submits applications. It comes with a dark, responsive React dashboard (Start/Stop, live logs via SSE, resume management with PDF upload + inline preview).

> **Use responsibly.** Only apply to jobs you genuinely want. The agent submits real applications on your behalf and a missed question could produce a wrong answer. Review each application's final "Review" screen mentally — the agent's logs are your audit trail.

---

## Features

- 🤖 **Automated Easy Apply** — detects Easy Apply (modal) jobs and applies automatically. Externally-hosted "Apply" jobs are skipped.
- 🧠 **Free LLM answers** — Groq-powered answer generation with automatic model fallback (no paid API required).
- ⌨️ **Full form support** — text inputs, `textarea`, numeric fields (salary/CTC/LPA/years), dropdowns, and radio groups with smart option matching.
- ⏹ **Abortable runs** — hit **Stop Agent** and in-flight AI calls/waits are interrupted immediately (AbortController + watchdogs).
- 📄 **Resume handling** — paste plain text **or** upload a PDF; text is extracted (`pdf-parse`) and used as context, with an inline PDF preview in the UI.
- 📡 **Live logs** — Server-Sent Events stream every action to the dashboard in real time.
- 📱 **Fully responsive** — works from desktop down to small phone screens.

---

## Project Structure

```
.
├── .env                     # Secrets (GROQ_API_KEY) — never commit this
├── .env.example             # Template for the env file
├── .gitignore
├── package.json             # Backend + orchestrating scripts
├── README.md
│
├── src/                     # Backend source
│   ├── agent-core.js        # Playwright automation: login → browse → fill → submit
│   ├── agent.js             # CLI entry point: node src/agent.js
│   ├── ai-solver.js         # Groq client + answer/option generation
│   └── server.js            # Express API + SSE + static UI hosting
│
├── scripts/                 # Utility/debug scripts
│   ├── inspect-dropdown.js  # Inspect LinkedIn form dropdown DOM
│   ├── save-session.js      # Save a LinkedIn login session to data/state.json
│   ├── test-ai.js           # Quick Groq round-trip test
│   └── test-apply.js        # CLI end-to-end run (max 3 jobs)
│
├── data/                    # Runtime data (git-ignored)
│   ├── resume.txt           # Extracted/plain-text resume used by the agent
│   ├── resume-upload.pdf    # Last uploaded PDF (served for preview)
│   └── state.json           # Optional saved login session
│
├── screenshots/             # Debug screenshots/HTML dumps (git-ignored)
│
├── ui/                      # React (Vite) dashboard
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js       # /api dev proxy → localhost:4000
│   └── src/
│       ├── App.jsx          # Dashboard UI
│       ├── App.css          # Responsive styles
│       ├── index.css
│       └── main.jsx
│
└── .agent-chrome-profile/   # Persistent Chrome profile w/ your login (git-ignored)
```

---

## Requirements

- **Node.js 18+**
- **Google Chrome** installed at `C:\Program Files\Google\Chrome\Application\chrome.exe` (edit `CHROME_PATH` in `src/agent-core.js` if elsewhere)
- A free **Groq API key** from [console.groq.com](https://console.groq.com/keys)
- A **LinkedIn account** (login is done manually once in the opened Chrome window)

## Setup

```bash
# 1. Install dependencies (both root + UI)
npm install
npm --prefix ui install

# 2. Configure your API key
copy .env.example .env        # Windows
#   ...then paste your Groq key into .env

# 3. Start the app (Express on :4000 → serves the built UI)
npm start
```

Open **http://localhost:4000** in your browser.

> **Dev mode** (hot-reload UI + backend): `npm run dev`, then open http://localhost:5173 (Vite proxies `/api` to the backend).

## Usage

1. **Add your resume** — paste plain text or click **Upload PDF Resume** (text is auto-extracted and previewed).
2. **Configure** — job keywords, Easy Apply filter, max applications.
3. **Start Agent** — a Chrome window opens at your LinkedIn job search. If login is required, log in manually once (the profile remembers it for future runs).
4. **Watch the Live Logs** — every field answered, dropdown chosen, and submission is streamed in.
5. **Stop Agent** — click **Stop Agent** anytime; the current action is interrupted and Chrome closes cleanly.

## CLI usage

```bash
npm run agent                 # run agent with defaults (Full Stack Engineer, 10 jobs)
npm run test:apply            # dry-run end-to-end, max 3 jobs, logs to terminal
npm run test:ai               # verify your Groq key works
npm run save-session          # save a login to data/state.json (optional)
```

Add your own parameters in `scripts/test-apply.js` to run a custom CLI session.

## How it works

1. `server.js` exposes `/api/start`, `/api/stop`, `/api/logs` (SSE), and `/api/resume`.
2. `runAgent()` in `agent-core.js` launches a **persistent Chrome profile**, navigates to `linkedin.com/jobs/search`, loops through job cards, and for each **Easy Apply** job:
   - Opens the modal (`openEasyApply`, with retries).
   - Scans visible fields (`fillVisibleQuestions`) — selects, radars, numerics, text.
   - Asks `ai-solver.js` for answers using the resume as context, with the Groq model fallback chain (`groq/compound` → `openai/gpt-oss-20b` → `qwen/qwen3.6-27b`).
   - Advances: **Submit → Review → Next**, verifying progress so required fields are caught.
   - Closes the modal, cleans up toasts, and moves to the next job.
3. A shared `stopSignal` + `AbortController` lets the UI stop the run within ~1s of clicking **Stop**.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `CORS`/connection errors in browser | Backend not running — restart `npm start` (UI now uses same-origin `/api`). |
| **Stop Agent** does nothing | Old server process on port 4000 — make sure you restarted after the update. |
| "No Easy Apply button" / external Apply | Job isn't Easy Apply; it's skipped by design. |
| "Could not extract text from PDF" | The PDF is scanned/image-only with no text layer; paste the text instead. |
| Not logged in | Log in manually in the opened Chrome window; the persistent profile saves it. |
| Port 4000 already in use | Kill the stale process or set `PORT` in `.env`. |

## Roadmap / Ideas

### 🎯 Core Improvements (LinkedIn)
- [ ] Support external ("Apply") jobs via the LinkedIn external flow
- [ ] Resume matching/filter scoring before applying
- [ ] Per-question answer review/approval queue
- [ ] Scheduling + email notifications
- [ ] Better anti-detection (human-like delays, mouse movements)

### 🌐 Multi-Portal Support (High Priority)
*Goal: Make this a universal job application agent*

- [ ] **Indeed** — Easy Apply + external applications
- [ ] **Naukri.com** — India's largest job portal
- [ ] **Glassdoor** — Easy Apply integration
- [ ] **Wellfound (AngelList)** — Startup jobs
- [ ] **Monster / CareerBuilder** — Legacy portals
- [ ] **Company career pages** — Generic form filler for any ATS (Greenhouse, Lever, Workday, etc.)
- [ ] **Portal abstraction layer** — Plugin architecture so contributors can add new portals easily

### 🧠 AI & Intelligence Features
- [ ] **Smart job filtering** — AI scores job match % before applying
- [ ] **Cover letter generation** — Auto-write personalized cover letters per job
- [ ] **Interview prep** — Generate likely questions based on job description
- [ ] **Salary negotiation assistant** — AI suggests counter-offers
- [ ] **Application tracking dashboard** — Kanban board: Applied → Screening → Interview → Offer

### 🛠 Platform & Extensibility
- [ ] **Plugin system** — `portals/` folder with each portal as independent module
- [ ] **Browser extension** — One-click apply from any job page
- [ ] **Headless cloud deployment** — Run on Railway/Render/VPS with persistent sessions
- [ ] **Multi-user support** — Teams/organizations with shared resume pool
- [ ] **API webhooks** — Notify external systems (Notion, Slack, Discord) on application events

### 🎨 Unique Differentiators (Make it Stand Out)
- [ ] **Video resume integration** — Record/upload video answers for async video interviews
- [ ] **Portfolio/GitHub auto-link** — Detect tech stack in JD, link relevant repos
- [ ] **Skill gap analysis** — "You're missing X skill for 40% of target roles"
- [ ] **Application analytics** — Heatmap of which keywords get responses
- [ ] **Referral network** — Find connections at target companies automatically

---

## 🤝 Contributing New Portals

The architecture is designed for easy portal addition. See [CONTRIBUTING.md](CONTRIBUTING.md#areas-for-contribution).

**To add a new portal:**
1. Create `src/portals/<portal-name>.js` implementing the `PortalAdapter` interface
2. Add selectors, login flow, and application logic
3. Register in `src/portals/index.js`
4. Add portal config to UI dashboard

```javascript
// Example portal adapter interface
class PortalAdapter {
  async login(page, credentials) { }
  async searchJobs(page, keywords, filters) { }
  async isEasyApply(jobCard) { }
  async apply(page, jobCard, resume, aiSolver) { }
  async handleExternalApply(page, url) { }
}
```

---

*Built with Groq, Playwright, Express, and React.*"# ai-job-applying-agent"
