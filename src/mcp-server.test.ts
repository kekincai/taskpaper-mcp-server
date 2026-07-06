import { describe, expect, it } from "vitest";
import { registerTaskPaperTools, toJsonText } from "./mcp-server.js";

describe("toJsonText", () => {
  it("wraps values as MCP text content", () => {
    expect(toJsonText({ ok: true })).toEqual({
      content: [{ type: "text", text: '{\n  "ok": true\n}' }]
    });
  });
});

describe("registerTaskPaperTools", () => {
  it("registers the first-version TaskPaper tools", () => {
    const names: string[] = [];
    const server = {
      registerTool(name: string) {
        names.push(name);
      }
    };

    registerTaskPaperTools(server, {
      status: async () => ({}),
      readFrontDocument: async () => ({}),
      searchItems: async () => ({}),
      addTask: async () => ({}),
      completeTask: async () => ({}),
      setFilter: async () => ({})
    });

    expect(names).toEqual([
      "taskpaper_status",
      "taskpaper_read_front_document",
      "taskpaper_search_items",
      "taskpaper_add_task",
      "taskpaper_complete_task",
      "taskpaper_set_filter"
    ]);
  });
});
