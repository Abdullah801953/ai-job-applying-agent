"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const agent_core_1 = require("../src/agent-core");
(0, agent_core_1.runAgent)({
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
//# sourceMappingURL=test-apply.js.map