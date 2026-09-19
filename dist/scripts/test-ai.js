"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const ai_solver_1 = require("../src/ai-solver");
(async () => {
    const q = 'Which one of these options is the best answer for "Are you currently located in Gurgaon?"? Choose ONLY from the list. Answer with just the option text.\nOptions:\nYes\nNo';
    const r = await (0, ai_solver_1.answerQuestion)(q, 'Resume: New Delhi, India. Full Stack Developer.');
    console.log('CHOICE:', JSON.stringify(r));
})().catch(e => console.error('ERR', e instanceof Error ? e.message : String(e)));
//# sourceMappingURL=test-ai.js.map