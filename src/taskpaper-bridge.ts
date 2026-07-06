import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const defaultExecFile = promisify(execFileCallback);

export interface EvaluateScriptRequest {
  document: "front";
  taskpaperFunction: string;
  options?: unknown;
}

export interface ExecFileResult {
  stdout: string;
  stderr: string;
}

export type ExecFile = (file: string, args: string[]) => Promise<ExecFileResult>;

export interface TaskPaperBridgeOptions {
  execFile?: ExecFile;
}

export function buildEvaluateScript(_request: EvaluateScriptRequest): string {
  const optionsJson = JSON.stringify(_request.options ?? null);
  const functionJson = JSON.stringify(_request.taskpaperFunction);

  return `
const taskpaper = Application("TaskPaper");
const script = ${functionJson};
const result = taskpaper.documents[0].evaluate({
  script,
  withOptions: ${optionsJson}
});
if (typeof result === "string") {
  result;
} else {
  JSON.stringify(result);
}
`;
}

export function parseJsonResult(stdout: string): unknown {
  return JSON.parse(stdout.trim());
}

export function createTaskPaperBridge(options: TaskPaperBridgeOptions = {}) {
  const execFile = options.execFile ?? defaultExecFile;

  async function runJxa(script: string): Promise<unknown> {
    const { stdout, stderr } = await execFile("osascript", ["-l", "JavaScript", "-e", script]);
    if (stderr.trim()) {
      throw new Error(stderr.trim());
    }
    return parseJsonResult(stdout);
  }

  return {
    runJxa,
    async evaluate(taskpaperFunction: string, evaluateOptions?: unknown): Promise<unknown> {
      return runJxa(
        buildEvaluateScript({
          document: "front",
          taskpaperFunction,
          options: evaluateOptions
        })
      );
    }
  };
}
