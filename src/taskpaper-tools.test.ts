import { describe, expect, it } from "vitest";
import { addTaskToTaskPaperText, createTaskPaperTools, normalizeTaskLine } from "./taskpaper-tools.js";

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

  it("reads the front document file when the document has a path", async () => {
    const tools = createTaskPaperTools(
      {
        evaluate: async () => {
          throw new Error("evaluate should not be used for file-backed read");
        },
        runJxa: async () => ({ file: "/tmp/tasks.taskpaper" })
      },
      {
        fileSystem: {
          readFile: async () => "Inbox:\n\t- From disk\n",
          writeFile: async () => {}
        }
      }
    );

    await expect(tools.readFrontDocument()).resolves.toEqual({
      text: "Inbox:\n\t- From disk\n",
      file: "/tmp/tasks.taskpaper"
    });
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

  it("writes added tasks to the front document file when the document has a path", async () => {
    const writes: Array<{ path: string; text: string }> = [];
    const tools = createTaskPaperTools(
      {
        evaluate: async () => {
          throw new Error("evaluate should not be used for file-backed add");
        },
        runJxa: async () => ({ file: "/tmp/tasks.taskpaper" })
      },
      {
        fileSystem: {
          readFile: async () => "Inbox:\n\t- Existing\n",
          writeFile: async (path, text) => {
            writes.push({ path, text });
          }
        }
      }
    );

    await tools.addTask({ text: "Buy milk", project: "Inbox", append: true });

    expect(writes).toEqual([
      {
        path: "/tmp/tasks.taskpaper",
        text: "Inbox:\n\t- Existing\n\t- Buy milk\n"
      }
    ]);
  });

  it("writes added tasks to an explicit file path", async () => {
    const writes: Array<{ path: string; text: string }> = [];
    const tools = createTaskPaperTools(
      {
        evaluate: async () => {
          throw new Error("evaluate should not be used for explicit file add");
        },
        runJxa: async () => {
          throw new Error("runJxa should not be used for explicit file add");
        }
      },
      {
        fileSystem: {
          readFile: async () => "Inbox:\n",
          writeFile: async (path, text) => {
            writes.push({ path, text });
          }
        }
      }
    );

    await tools.addTask({ file: "/tmp/tasks.taskpaper", text: "Buy milk", project: "Inbox" });

    expect(writes).toEqual([{ path: "/tmp/tasks.taskpaper", text: "Inbox:\n\t- Buy milk\n" }]);
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

describe("addTaskToTaskPaperText", () => {
  it("appends a task inside the named project block", () => {
    expect(addTaskToTaskPaperText("Inbox:\n\t- Existing\nOther:\n", { text: "- Buy milk", project: "Inbox" })).toBe(
      "Inbox:\n\t- Existing\n\t- Buy milk\nOther:\n"
    );
  });

  it("creates the project when requested and missing", () => {
    expect(
      addTaskToTaskPaperText("Welcome:\n\t- Read\n", {
        text: "- Buy milk",
        project: "Inbox",
        createProject: true
      })
    ).toBe("Welcome:\n\t- Read\nInbox:\n\t- Buy milk\n");
  });
});
