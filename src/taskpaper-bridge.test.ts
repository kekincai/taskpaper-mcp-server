import { describe, expect, it } from "vitest";
import { buildEvaluateScript, createTaskPaperBridge, parseJsonResult } from "./taskpaper-bridge.js";

describe("buildEvaluateScript", () => {
  it("passes options into TaskPaper evaluate using withOptions", () => {
    const script = buildEvaluateScript({
      document: "front",
      taskpaperFunction: "function TaskPaperContextScript(editor, options) { return options.query; }",
      options: { query: "not @done" }
    });

    expect(script).toContain('Application("TaskPaper")');
    expect(script).toContain("documents[0].evaluate");
    expect(script).toContain("withOptions");
    expect(script).toContain('"query":"not @done"');
  });
});

describe("parseJsonResult", () => {
  it("parses JSON strings returned from osascript", () => {
    expect(parseJsonResult('{"ok":true}\n')).toEqual({ ok: true });
  });
});

describe("createTaskPaperBridge", () => {
  it("runs osascript in JavaScript mode", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const bridge = createTaskPaperBridge({
      execFile: async (file, args) => {
        calls.push({ file, args });
        return { stdout: '{"ok":true}\n', stderr: "" };
      }
    });

    await expect(bridge.runJxa("1 + 1")).resolves.toEqual({ ok: true });
    expect(calls[0]).toEqual({ file: "osascript", args: ["-l", "JavaScript", "-e", "1 + 1"] });
  });

  it("evaluates a TaskPaper context script and parses JSON output", async () => {
    let script = "";
    const bridge = createTaskPaperBridge({
      execFile: async (_file, args) => {
        script = args[3] ?? "";
        return { stdout: '{"items":[]}\n', stderr: "" };
      }
    });

    await expect(
      bridge.evaluate("function TaskPaperContextScript(editor, options) { return JSON.stringify(options); }", {
        items: []
      })
    ).resolves.toEqual({ items: [] });
    expect(script).toContain("TaskPaperContextScript");
    expect(script).toContain("withOptions");
  });
});
