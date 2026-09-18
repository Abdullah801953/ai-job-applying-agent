import 'dotenv/config';
import { runAgent } from '../src/agent-core';

runAgent({
  keywords: 'Full Stack Engineer',
  remote: true,
  maxApplications: 3,
  onLog: (entry) => console.log(`[${entry.type}]`, entry.message),
}).then(result => {
  console.log('\nRESULT — Applied:', result.applied, 'of 3');
  process.exit(0);
}).catch(e => {
  console.error('FATAL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});