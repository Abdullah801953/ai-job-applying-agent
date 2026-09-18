import 'dotenv/config';
import express, { Request, Response, RequestHandler } from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { runAgent, loadResume } from './agent-core';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

const DATA_DIR = path.join(__dirname, '..', 'data');
const RESUME_TXT = path.join(DATA_DIR, 'resume.txt');
const RESUME_PDF = path.join(DATA_DIR, 'resume-upload.pdf');

let running = false;
const clients = new Set<Response>();
let stopSignal = { stopped: false };

function broadcast(data: unknown): void {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

app.get('/api/logs', ((req: Request, res: Response) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  clients.add(res);

  res.write(`data: ${JSON.stringify({ type: 'status', message: 'Connected to agent stream', time: Date.now() })}\n\n`);

  const ping = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
}) as RequestHandler);

interface StartBody {
  keywords?: string;
  remote?: boolean;
  maxApplications?: number;
}

app.post('/api/start', async (req: Request<{}, {}, StartBody>, res: Response) => {
  if (running) {
    return res.status(409).json({ error: 'Agent is already running.' });
  }
  running = true;
  stopSignal = { stopped: false };
  const { keywords = 'Full Stack Engineer', remote = true, maxApplications = 10 } = req.body ?? {};

  const onLog = (entry: { type: string; message: string; time: number }) => broadcast(entry);
  broadcast({ type: 'status', message: 'Agent started' });

  try {
    const result = await runAgent({ keywords, remote, maxApplications, onLog, stopSignal });
    broadcast({ type: 'done', message: `Finished. Applied to ${result.applied} jobs.`, result });
    running = false;
  } catch (err) {
    broadcast({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    running = false;
  }

  res.json({ ok: true });
});

app.post('/api/stop', ((req: Request, res: Response) => {
  stopSignal = stopSignal ?? { stopped: false };
  if (!stopSignal.stopped) {
    stopSignal.stopped = true;
    broadcast({ type: 'status', message: 'Stop requested — finishing current action...' });
  }
  res.json({ ok: true });
}) as RequestHandler);

interface ResumeBody {
  text?: string;
  pdfBase64?: string;
  fileName?: string;
}

app.post('/api/resume', async (req: Request<{}, {}, ResumeBody>, res: Response) => {
  const { text, pdfBase64, fileName } = req.body ?? {};
  if (pdfBase64) {
    try {
      const buf = Buffer.from(pdfBase64, 'base64');
      // @ts-expect-error - pdf-parse doesn't have proper types
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buf });
      const result = await parser.getText();
      await parser.destroy().catch(() => {});
      const parsed = (result.text ?? '').trim();
      if (parsed.length < 20) {
        return res.status(400).json({ error: 'Could not extract text from PDF. It may be a scanned/image PDF.' });
      }
      fs.writeFileSync(RESUME_TXT, parsed);
      fs.writeFileSync(RESUME_PDF, buf);
      const safeName = fileName && /\.pdf$/i.test(fileName) ? path.basename(fileName) : 'resume.pdf';
      return res.json({ ok: true, text: parsed, pdfFile: fs.existsSync(RESUME_PDF) ? safeName : null });
    } catch (e) {
      return res.status(400).json({ error: `PDF parsing failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  if (!text) return res.status(400).json({ error: 'No resume text provided.' });
  fs.writeFileSync(RESUME_TXT, text);
  res.json({ ok: true });
});

app.get('/api/resume-pdf', ((req: Request, res: Response) => {
  if (!fs.existsSync(RESUME_PDF)) return res.status(404).json({ error: 'No PDF uploaded.' });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="resume.pdf"' });
  fs.createReadStream(RESUME_PDF).pipe(res);
}) as RequestHandler);

app.get('/api/resume', ((req: Request, res: Response) => {
  res.json({ text: loadResume() ?? '' });
}) as RequestHandler);

// Serve the React build in production
const dist = path.join(__dirname, '..', 'ui', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', ((req: Request, res: Response) => res.sendFile(path.join(dist, 'index.html'))) as RequestHandler);
}

const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});

export { app };