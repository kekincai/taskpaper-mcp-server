import { describe, expect, it } from "vitest";
import {
  addTaskToTaskPaperText,
  archiveDoneInTaskPaperText,
  completeTaskInTaskPaperText,
  createTaskPaperTools,
  listProjectsInTaskPaperText,
  normalizeTaskLine,
  parseTaskPaperText,
  searchTaskPaperText
} from "./taskpaper-tools.js";

describe("normalizeTaskLine", () => {
  it("adds TaskPaper task syntax when a plain task is provided", () => {
    expect(normalizeTaskLine("Buy milk @due(today)")).toBe("- Buy milk @due(today)");
  });

  it("preserves existing TaskPaper task syntax", () => {
    expect(normalizeTaskLine("- Buy milk")).toBe("- Buy milk");
  });

  it("appends friendly metadata as TaskPaper tags", () => {
    expect(
      normalizeTaskLine("Buy milk", {
        due: "today",
        start: "2026-07-08",
        tags: { home: "", priority: "high" }
      })
    ).toBe("- Buy milk @due(today) @start(2026-07-08) @home @priority(high)");
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

  it("searches an explicit file without using TaskPaper", async () => {
    const tools = createTaskPaperTools(
      {
        evaluate: async () => {
          throw new Error("evaluate should not be used for explicit file search");
        },
        runJxa: async () => {
          throw new Error("runJxa should not be used for explicit file search");
        }
      },
      {
        fileSystem: {
          readFile: async () => "Inbox:\n\t- Buy milk @due(today)\n\t- Call bank @done(2026-07-06)\n",
          writeFile: async () => {}
        }
      }
    );

    const result = await tools.searchItems({ file: "/tmp/tasks.taskpaper", query: "not @done" });

    expect(result.items).toEqual([
      expect.objectContaining({ line: 2, text: "- Buy milk @due(today)", content: "Buy milk", type: "task" })
    ]);
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

    await tools.addTask({ file: "/tmp/tasks.taskpaper", text: "Buy milk", project: "Inbox", due: "today" });

    expect(writes).toEqual([{ path: "/tmp/tasks.taskpaper", text: "Inbox:\n\t- Buy milk @due(today)\n" }]);
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

  it("marks the first matching explicit-file task done on disk", async () => {
    const writes: Array<{ path: string; text: string }> = [];
    const tools = createTaskPaperTools(
      {
        evaluate: async () => {
          throw new Error("evaluate should not be used for explicit file complete");
        },
        runJxa: async () => {
          throw new Error("runJxa should not be used for explicit file complete");
        }
      },
      {
        fileSystem: {
          readFile: async () => "Inbox:\n\t- Buy milk\n",
          writeFile: async (path, text) => writes.push({ path, text })
        }
      }
    );

    await expect(
      tools.completeTask({ file: "/tmp/tasks.taskpaper", query: "Buy milk", date: "2026-07-07" })
    ).resolves.toEqual({
      completed: 1,
      file: "/tmp/tasks.taskpaper",
      line: 2
    });
    expect(writes).toEqual([{ path: "/tmp/tasks.taskpaper", text: "Inbox:\n\t- Buy milk @done(2026-07-07)\n" }]);
  });

  it("reads an explicit file", async () => {
    const tools = createTaskPaperTools(
      {
        evaluate: async () => {
          throw new Error("evaluate should not be used for explicit file read");
        },
        runJxa: async () => {
          throw new Error("runJxa should not be used for explicit file read");
        }
      },
      {
        fileSystem: {
          readFile: async () => "Inbox:\n\t- Buy milk\n",
          writeFile: async () => {}
        }
      }
    );

    await expect(tools.readFile({ file: "/tmp/tasks.taskpaper" })).resolves.toEqual({
      file: "/tmp/tasks.taskpaper",
      text: "Inbox:\n\t- Buy milk\n"
    });
  });

  it("lists projects in an explicit file", async () => {
    const tools = createTaskPaperTools(
      {
        evaluate: async () => ({}),
        runJxa: async () => ({})
      },
      {
        fileSystem: {
          readFile: async () => "Inbox:\n\t- Buy milk\nWork:\n\t- Ship\n",
          writeFile: async () => {}
        }
      }
    );

    await expect(tools.listProjects({ file: "/tmp/tasks.taskpaper" })).resolves.toEqual({
      file: "/tmp/tasks.taskpaper",
      projects: [
        { line: 1, name: "Inbox", depth: 0 },
        { line: 3, name: "Work", depth: 0 }
      ]
    });
  });

  it("archives done tasks from an explicit file", async () => {
    const writes: Array<{ path: string; text: string }> = [];
    const tools = createTaskPaperTools(
      {
        evaluate: async () => ({}),
        runJxa: async () => ({})
      },
      {
        fileSystem: {
          readFile: async () => "Inbox:\n\t- Open\n\t- Closed @done(2026-07-06)\nArchive:\n\t- Older @done(2026-07-01)\n",
          writeFile: async (path, text) => writes.push({ path, text })
        }
      }
    );

    await expect(tools.archiveDone({ file: "/tmp/tasks.taskpaper", archiveProject: "Archive" })).resolves.toEqual({
      archived: 1,
      file: "/tmp/tasks.taskpaper"
    });
    expect(writes[0]?.text).toBe(
      "Inbox:\n\t- Open\nArchive:\n\t- Older @done(2026-07-01)\n\t- Closed @done(2026-07-06)\n"
    );
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

describe("parseTaskPaperText", () => {
  it("parses projects, tasks, notes, tags, depth, and line numbers", () => {
    expect(parseTaskPaperText("Inbox:\n\t- Buy milk @due(today)\n\tA note\n")).toEqual([
      { line: 1, depth: 0, indent: "", type: "project", text: "Inbox:", content: "Inbox", tags: {} },
      {
        line: 2,
        depth: 1,
        indent: "\t",
        type: "task",
        text: "- Buy milk @due(today)",
        content: "Buy milk",
        tags: { due: "today" }
      },
      { line: 3, depth: 1, indent: "\t", type: "note", text: "A note", content: "A note", tags: {} }
    ]);
  });
});

describe("searchTaskPaperText", () => {
  it("supports not @done and tag searches", () => {
    const text = "Inbox:\n\t- Buy milk @due(today)\n\t- Closed @done(2026-07-06)\n";
    expect(searchTaskPaperText(text, "not @done").map((item) => item.content)).toEqual(["Inbox", "Buy milk"]);
    expect(searchTaskPaperText(text, "@due").map((item) => item.content)).toEqual(["Buy milk"]);
  });
});

describe("completeTaskInTaskPaperText", () => {
  it("adds a done tag to the first matching task", () => {
    expect(completeTaskInTaskPaperText("Inbox:\n\t- Buy milk\n", { query: "Buy milk", date: "2026-07-07" })).toEqual({
      completed: 1,
      line: 2,
      text: "Inbox:\n\t- Buy milk @done(2026-07-07)\n"
    });
  });
});

describe("listProjectsInTaskPaperText", () => {
  it("returns project lines", () => {
    expect(listProjectsInTaskPaperText("Inbox:\n\t- Buy milk\nWork:\n")).toEqual([
      { line: 1, name: "Inbox", depth: 0 },
      { line: 3, name: "Work", depth: 0 }
    ]);
  });
});

describe("archiveDoneInTaskPaperText", () => {
  it("moves done tasks into an archive project", () => {
    expect(archiveDoneInTaskPaperText("Inbox:\n\t- Open\n\t- Closed @done(2026-07-06)\n", "Archive")).toEqual({
      archived: 1,
      text: "Inbox:\n\t- Open\nArchive:\n\t- Closed @done(2026-07-06)\n"
    });
  });
});
