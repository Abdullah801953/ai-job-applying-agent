import { useEffect, useRef, useState } from 'react'
import './App.css'

const API = ''

export default function App() {
  const [logList, setLogList] = useState([])
  const [status, setStatus] = useState('idle')
  const [applied, setApplied] = useState(0)
  const [resume, setResume] = useState('')
  const [resumeSaved, setResumeSaved] = useState(false)
  const [pdfPreview, setPdfPreview] = useState(null)
  const [config, setConfig] = useState({
    keywords: 'Full Stack Engineer',
    remote: true,
    maxApplications: 10,
  })
  const logBoxRef = useRef(null)
  const esRef = useRef(null)

  useEffect(() => {
    fetch(`${API}/api/resume`)
      .then(r => r.json())
      .then(d => setResume(d.text !== 'No resume provided.' ? d.text : ''))
      .catch(() => {})

    if (!esRef.current) {
      const es = new EventSource(`${API}/api/logs`)
      esRef.current = es
      es.onmessage = (e) => {
        const data = JSON.parse(e.data)
        if (data.type === 'status') setStatus('running')
        if (data.type === 'done') {
          setStatus('done')
          setApplied(data.result.applied)
        }
        if (data.type === 'error') setStatus('error')
        setLogList(prev => [...prev, data])
      }
      es.onerror = () => {}
    }
    return () => esRef.current?.close()
  }, [])

  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight
    }
  }, [logList])

  const startAgent = async () => {
    setLogList([])
    setApplied(0)
    setStatus('running')
    const res = await fetch(`${API}/api/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!res.ok) {
      setStatus('error')
      const err = await res.json()
      setLogList(prev => [...prev, { type: 'error', message: err.error, time: Date.now() }])
    }
  }

  const stopAgent = async () => {
    await fetch(`${API}/api/stop`, { method: 'POST' })
    setLogList(prev => [...prev, { type: 'status', message: 'Stop requested...', time: Date.now() }])
  }

  const saveResume = async () => {
    const res = await fetch(`${API}/api/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: resume }),
    })
    if (res.ok) {
      setResumeSaved(true)
      setTimeout(() => setResumeSaved(false), 2000)
    }
  }

  const uploadPdf = async (file) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1]
      const res = await fetch(`${API}/api/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64, fileName: file.name }),
      })
      if (res.ok) {
        const data = await res.json()
        setResume(data.text)
        setPdfPreview({ name: file.name, url: `${API}/api/resume-pdf?ts=${Date.now()}` })
        setResumeSaved(true)
        setTimeout(() => setResumeSaved(false), 2000)
      } else {
        const err = await res.json()
        setLogList(prev => [...prev, { type: 'error', message: err.error, time: Date.now() }])
      }
    }
    reader.readAsDataURL(file)
  }

  const running = status === 'running'
  const statusLabel = running ? 'Running' : status === 'done' ? 'Completed' : status === 'error' ? 'Error' : 'Idle'

  return (
    <div className="app">
      <div className="bg-glow bg-glow-1"></div>
      <div className="bg-glow bg-glow-2"></div>

      <header className="header">
        <div className="logo">
          <div className="logo-badge">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="4" />
              <path d="M9 9h.01M15 9h.01M9 15h6" />
              <path d="M3 3l-1 6 6-1" />
            </svg>
          </div>
          <div>
            <h1>JobApply <span>Agent</span></h1>
            <p className="subtitle">AI-powered LinkedIn Easy Apply automation</p>
          </div>
        </div>
        <div className={`status-pill ${status}`}>
          <span className="dot"></span>
          <span>{statusLabel}</span>
        </div>
      </header>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon">🎯</div>
          <div className="stat-info">
            <span className="stat-value">{config.keywords || '—'}</span>
            <span className="stat-label">Search Keywords</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-info">
            <span className="stat-value">{applied}</span>
            <span className="stat-label">Applications Submitted</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🎛️</div>
          <div className="stat-info">
            <span className="stat-value">{config.maxApplications}</span>
            <span className="stat-label">Max Applications</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🟢</div>
          <div className="stat-info">
            <span className="stat-value">{config.remote ? 'Easy Apply' : 'All Jobs'}</span>
            <span className="stat-label">Apply Filter</span>
          </div>
        </div>
      </div>

      <main className="main">
        <section className="panel control-panel">
          <div className="panel-title">
            <span className="panel-icon">⚙️</span>
            <h2>Agent Configuration</h2>
          </div>

          <label className="field">
            <span>Job Keywords</span>
            <div className="input-wrap">
              <svg className="input-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                value={config.keywords}
                onChange={e => setConfig({ ...config, keywords: e.target.value })}
                placeholder="e.g. Full Stack Engineer"
              />
            </div>
          </label>

          <label className="field checkbox">
            <div className="switch">
              <input
                type="checkbox"
                checked={config.remote}
                onChange={e => setConfig({ ...config, remote: e.target.checked })}
              />
              <span className="slider"></span>
            </div>
            <span>Easy Apply only</span>
          </label>

          <label className="field">
            <span>Max Applications</span>
            <div className="input-wrap">
              <input
                type="number"
                min="1"
                max="50"
                value={config.maxApplications}
                onChange={e => setConfig({ ...config, maxApplications: Number(e.target.value) })}
              />
            </div>
          </label>

          <div className="btn-row">
            <button className="btn primary" onClick={startAgent} disabled={running}>
              {running ? (
                <>
                  <span className="spinner"></span>
                  Agent Running...
                </>
              ) : (
                <>▶ Start Agent</>
              )}
            </button>
            {running && (
              <button className="btn danger" onClick={stopAgent}>
                ⏹ Stop Agent
              </button>
            )}
          </div>

          {running && <p className="hint">A Chrome window will open. If login is required, log in manually — the agent will continue automatically.</p>}
        </section>

        <section className="panel">
          <div className="panel-title">
            <span className="panel-icon">📄</span>
            <h2>Resume</h2>
          </div>
          <div className="upload-row">
            <label className="btn upload-btn">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload PDF Resume
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={e => {
                  const file = e.target.files[0]
                  if (file) uploadPdf(file)
                  e.target.value = ''
                }}
                hidden
              />
            </label>
            <span className="upload-hint">Extracts text automatically</span>
          </div>
          {pdfPreview && (
            <div className="pdf-preview">
              <div className="pdf-preview-head">
                <span className="pdf-preview-title">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  {pdfPreview.name}
                </span>
                <button className="pdf-preview-close" onClick={() => setPdfPreview(null)} aria-label="Close preview">✕</button>
              </div>
              <iframe
                className="pdf-preview-frame"
                src={pdfPreview.url}
                title="Resume PDF preview"
              />
            </div>
          )}
          <textarea
            value={resume}
            onChange={e => setResume(e.target.value)}
            placeholder="Paste your resume text here, or upload a PDF above. The AI uses this to answer job application questions."
            rows={12}
          />
          <div className="resume-actions">
            {resumeSaved ? <span className="saved-tag">✓ Saved successfully</span> : <span className="saved-tag dim">Last synced with server</span>}
            <button className="btn" onClick={saveResume}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <path d="M17 21v-8H7v8" />
                <path d="M7 3v5h8" />
              </svg>
              Save Resume
            </button>
          </div>
        </section>

        <section className="panel log-panel">
          <div className="panel-title log-header">
            <div className="title-left">
              <span className="panel-icon">📋</span>
              <h2>Live Logs</h2>
              {running && <span className="live-badge"><span className="live-dot"></span> LIVE</span>}
            </div>
            {status === 'done' && <span className="applied-badge">🎉 {applied} jobs applied</span>}
          </div>
          <div className="log-box" ref={logBoxRef}>
            {logList.length === 0 ? (
              <div className="empty-log">
                <span className="empty-icon">📭</span>
                <p>No activity yet.</p>
                <p className="empty-sub">Start the agent to see live logs here.</p>
              </div>
            ) : (
              logList.map((entry, i) => (
                <div key={i} className={`log-line ${entry.type}`}>
                  <span className="log-time">{new Date(entry.time).toLocaleTimeString()}</span>
                  <span className="log-dot"></span>
                  <span className="log-msg">{entry.message}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>Built with <span className="heart">♥</span> — Groq AI + Playwright + React</p>
      </footer>
    </div>
  )
}
