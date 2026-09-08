require('dotenv').config();
const { answerQuestion } = require('../src/ai-solver');

(async () => {
  const q = 'Which one of these options is the best answer for "Are you currently located in Gurgaon?"? Choose ONLY from the list. Answer with just the option text.\nOptions:\nYes\nNo';
  const r = await answerQuestion(q, 'Resume: New Delhi, India. Full Stack Developer.');
  console.log('CHOICE:', JSON.stringify(r));
})().catch(e => console.error('ERR', e.message));