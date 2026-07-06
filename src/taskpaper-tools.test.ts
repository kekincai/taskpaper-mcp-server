import { describe, expect, it } from "vitest";
import { createTaskPaperTools, normalizeTaskLine } from "./taskpaper-tools.js";

describe("normalizeTaskLine", () => {
  it("adds TaskPaper task syntax when a plain task is provided", () => {
    expect(normalizeTaskLine("Buy milk @due(today)")).toBe("- Buy milk @due(today)");
  });

  it("preserves existing TaskPaper task syntax", () => {
    expect(normalizeTaskLine("- Buy milk")).toBe("- Buy milk");
  });
});

describe("createTaskPaperTools", () => {
  it("reports app status from JXA", async () => {
    const tools = createTaskPaperTools({
      evaluate: async () => ({}),
      runJxa: async () => ({ installed: true, running: false, documents: 0 })
    });

    await expect(tools.status()).resolves.toEqual({ installed: true, running: false, documents: 0 });
  });

  it("reads the front document serialization", async () => {
    const tools = createTaskPaperTools({
      evaluate: async () => "Inbox:\n\t- Buy milk",
      runJxa: async () => ({})
    });

    await expect(tools.readFrontDocument()).resolves.toEqual({ text: "Inbox:\n\t- Buy milk" });
  });

  it("searches items through a TaskPaper item path", async () => {
    const calls: Array<{ options: unknown }> = [];
    const tools = createTaskPaperTools({
      evaluate: async (_taskpaperFunction, options) => {
        calls.push({ options });
        return [{ id: "abc", text: "- Buy milk", type: "task" }];
      },
      runJxa: async () => ({})
    });

    const result = await tools.searchItems({ query: "not @done" });

    expect(calls[0]?.options).toEqual({ query: "not @done" });
    expect(result.items).toEqual([{ id: "abc", text: "- Buy milk", type: "task" }]);
  });

  it("adds a normalized task line to the selected project", async () => {
    let options: unknown;
    const tools = createTaskPaperTools({
      evaluate: async (_taskpaperFunction, receivedOptions) => {
        options = receivedOptions;
        return { added: 1 };
      },
      runJxa: async () => ({})
    });

    await tools.addTask({ text: "Buy milk", project: "Inbox", append: false });

    expect(options).toEqual({
      text: "- Buy milk",
      project: "Inbox",
      append: false,
      createProject: true
    });
  });

  it("marks the first matching item done with an ISO date", async () => {
    let options: unknown;
    const tools = createTaskPaperTools({
      evaluate: async (_taskpaperFunction, receivedOptions) => {
        options = receivedOptions;
        return { completed: 1 };
      },
      runJxa: async () => ({})
    });

    await tools.completeTask({ query: "Buy milk", date: "2026-07-06" });

    expect(options).toEqual({ query: "Buy milk", date: "2026-07-06" });
  });

  it("sets the front document filter", async () => {
    let options: unknown;
    const tools = createTaskPaperTools({
      evaluate: async (_taskpaperFunction, receivedOptions) => {
        options = receivedOptions;
        return { filter: "not @done" };
      },
      runJxa: async () => ({})
    });

    await tools.setFilter({ query: "not @done" });

    expect(options).toEqual({ query: "not @done" });
  });
});
