import 'dotenv/config';
export declare function loadResume(): string;
interface RunAgentOptions {
    keywords?: string;
    remote?: boolean;
    maxApplications?: number;
    onLog?: (entry: LogEntry) => void;
    stopSignal?: {
        stopped: boolean;
    } | null;
}
interface LogEntry {
    type: string;
    message: string;
    time: number;
}
export declare function runAgent(options?: RunAgentOptions): Promise<{
    applied: number;
}>;
export {};
//# sourceMappingURL=agent-core.d.ts.map