import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const MODELS = ['groq/compound', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'];

function cleanAnswer(raw: string): string {
  if (!raw) return '';
  let t = raw.trim();
  t = t.replace(/^thinking[\s\S]*?^\s*[-*_#]*\s*Answer\s*[:*_-]*\s*/im, '');
  t = t.replace(/^(thinking[\s:]+)[\s\S]*$/i, '');
  t = t.split('\n').map(l => l.trim()).filter(Boolean).pop() || t;
  t = t.replace(/^[-*]\s*/, '').trim();
  return t;
}

async function askModel(model: string, prompt: string, signal?: AbortSignal): Promise<string> {
  const response = await client.chat.completions.create(
    {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.3,
    },
    { signal }
  );
  return response.choices[0].message.content ?? '';
}

export async function answerQuestion(
  questionText: string,
  userResumeText: string,
  signal?: AbortSignal
): Promise<string> {
  const prompt = `
You are an automated job applicant with a precise, concise style.
Candidate Resume Summary: ${userResumeText}
Question asked in job form: "${questionText}"

Reply with ONLY the answer value on a single line. No explanations, no analysis, no thinking preamble.
`;

  let lastErr: Error | null = null;
  for (const model of MODELS) {
    try {
      const content = await askModel(model, prompt, signal);
      const cleaned = cleanAnswer(content);
      if (cleaned && cleaned.length > 0 && cleaned.length < 200) return cleaned;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error('All AI models failed to respond.');
}

export async function pickOption(
  questionText: string,
  optionList: string[],
  signal?: AbortSignal
): Promise<string> {
  const prompt = `
You are an automated job applicant.
Question: "${questionText}"
Available options:
${optionList.join('\n')}

Reply with ONLY the exact text of the single best option. No explanations, no thinking preamble.
`;

  let lastErr: Error | null = null;
  for (const model of MODELS) {
    try {
      const content = await askModel(model, prompt, signal);
      const cleaned = cleanAnswer(content);
      if (cleaned) {
        const exact = optionList.find(o => o.toLowerCase() === cleaned.toLowerCase());
        const containing = optionList.find(
          o => o.toLowerCase().includes(cleaned.toLowerCase()) || cleaned.toLowerCase().includes(o.toLowerCase())
        );
        if (exact || containing) return (exact ?? containing) as string;
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error('AI option selection failed.');
}