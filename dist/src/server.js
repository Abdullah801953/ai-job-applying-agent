"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const agent_core_1 = require("./agent-core");
const app = (0, express_1.default)();
exports.app = app;
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '25mb' }));
const DATA_DIR = path.join(__dirname, '..', 'data');
const RESUME_TXT = path.join(DATA_DIR, 'resume.txt');
const RESUME_PDF = path.join(DATA_DIR, 'resume-upload.pdf');
let running = false;
const clients = new Set();
let stopSignal = { stopped: false };
function broadcast(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
        res.write(payload);
    }
}
app.get('/api/logs', ((req, res) => {
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
}));
app.post('/api/start', async (req, res) => {
    if (running) {
        return res.status(409).json({ error: 'Agent is already running.' });
    }
    running = true;
    stopSignal = { stopped: false };
    const { keywords = 'Full Stack Engineer', remote = true, maxApplications = 10 } = req.body ?? {};
    const onLog = (entry) => broadcast(entry);
    broadcast({ type: 'status', message: 'Agent started' });
    try {
        const result = await (0, agent_core_1.runAgent)({ keywords, remote, maxApplications, onLog, stopSignal });
        broadcast({ type: 'done', message: `Finished. Applied to ${result.applied} jobs.`, result });
        running = false;
    }
    catch (err) {
        broadcast({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        running = false;
    }
    res.json({ ok: true });
});
app.post('/api/stop', ((req, res) => {
    stopSignal = stopSignal ?? { stopped: false };
    if (!stopSignal.stopped) {
        stopSignal.stopped = true;
        broadcast({ type: 'status', message: 'Stop requested — finishing current action...' });
    }
    res.json({ ok: true });
}));
app.post('/api/resume', async (req, res) => {
    const { text, pdfBase64, fileName } = req.body ?? {};
    if (pdfBase64) {
        try {
            const buf = Buffer.from(pdfBase64, 'base64');
            // @ts-expect-error - pdf-parse doesn't have proper types
            const { PDFParse } = await Promise.resolve().then(() => __importStar(require('pdf-parse')));
            const parser = new PDFParse({ data: buf });
            const result = await parser.getText();
            await parser.destroy().catch(() => { });
            const parsed = (result.text ?? '').trim();
            if (parsed.length < 20) {
                return res.status(400).json({ error: 'Could not extract text from PDF. It may be a scanned/image PDF.' });
            }
            fs.writeFileSync(RESUME_TXT, parsed);
            fs.writeFileSync(RESUME_PDF, buf);
            const safeName = fileName && /\.pdf$/i.test(fileName) ? path.basename(fileName) : 'resume.pdf';
            return res.json({ ok: true, text: parsed, pdfFile: fs.existsSync(RESUME_PDF) ? safeName : null });
        }
        catch (e) {
            return res.status(400).json({ error: `PDF parsing failed: ${e instanceof Error ? e.message : String(e)}` });
        }
    }
    if (!text)
        return res.status(400).json({ error: 'No resume text provided.' });
    fs.writeFileSync(RESUME_TXT, text);
    res.json({ ok: true });
});
app.get('/api/resume-pdf', ((req, res) => {
    if (!fs.existsSync(RESUME_PDF))
        return res.status(404).json({ error: 'No PDF uploaded.' });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="resume.pdf"' });
    fs.createReadStream(RESUME_PDF).pipe(res);
}));
app.get('/api/resume', ((req, res) => {
    res.json({ text: (0, agent_core_1.loadResume)() ?? '' });
}));
// Serve the React build in production
const dist = path.join(__dirname, '..', 'ui', 'dist');
if (fs.existsSync(dist)) {
    app.use(express_1.default.static(dist));
    app.get('*', ((req, res) => res.sendFile(path.join(dist, 'index.html'))));
}
const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map