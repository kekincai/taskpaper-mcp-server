import { readFile, writeFile } from "node:fs/promises";

export interface TaskPaperBridge {
  evaluate(taskpaperFunction: string, options?: unknown): Promise<unknown>;
  runJxa(script: string): Promise<unknown>;
}

declare const ItemSerializer: any;

export interface TaskPaperToolsOptions {
  fileSystem?: {
    readFile(path: string, encoding: "utf8"): Promise<string>;
    writeFile(path: string, text: string, encoding: "utf8"): Promise<void>;
  };
}

export interface TaskPaperItem {
  line: number;
  depth: number;
  indent: string;
  type: "project" | "task" | "note";
  text: string;
  content: string;
  tags: Record<string, string>;
}

export interface TaskPaperProject {
  line: number;
  name: string;
  depth: number;
}

export function normalizeTaskLine(text: string): string {
  const trimmed = text.trim();
  if (/^[-+*]\s/.test(trimmed)) {
    return trimmed;
  }
  return `- ${trimmed}`;
}

function depthFromIndent(indent: string): number {
  const tabs = (indent.match(/\t/g) ?? []).length;
  const spaces = (indent.match(/ /g) ?? []).length;
  return tabs + Math.floor(spaces / 2);
}

function parseTags(text: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const tagPattern = /@([A-Za-z0-9_-]+)(?:\(([^)]*)\))?/g;
  for (const match of text.matchAll(tagPattern)) {
    tags[match[1] ?? ""] = match[2] ?? "";
  }
  delete tags[""];
  return tags;
}

function stripTags(text: string): string {
  return text.replace(/\s*@([A-Za-z0-9_-]+)(?:\([^)]*\))?/g, "").trim();
}

export function parseTaskPaperText(taskpaperText: string): TaskPaperItem[] {
  return taskpaperText
    .split("\n")
    .flatMap((rawLine, index): TaskPaperItem[] => {
      if (!rawLine.trim()) {
        return [];
      }

      const indent = rawLine.match(/^\s*/)?.[0] ?? "";
      const text = rawLine.slice(indent.length);
      const depth = depthFromIndent(indent);
      const tags = parseTags(text);

      if (text.endsWith(":")) {
        return [
          {
            line: index + 1,
            depth,
            indent,
            type: "project",
            text,
            content: stripTags(text.slice(0, -1)),
            tags
          }
        ];
      }

      if (/^[-+*]\s/.test(text)) {
        const body = text.replace(/^[-+*]\s+/, "");
        return [
          {
            line: index + 1,
            depth,
            indent,
            type: "task",
            text,
            content: stripTags(body),
            tags
          }
        ];
      }

      return [
        {
          line: index + 1,
          depth,
          indent,
          type: "note",
          text,
          content: stripTags(text),
          tags
        }
      ];
    });
}

export function searchTaskPaperText(taskpaperText: string, query: string): TaskPaperItem[] {
  const trimmed = query.trim();
  const items = parseTaskPaperText(taskpaperText);

  if (trimmed === "not @done") {
    return items.filter((item) => !("done" in item.tags));
  }

  const tagMatch = trimmed.match(/^@([A-Za-z0-9_-]+)$/);
  if (tagMatch) {
    const tagName = tagMatch[1] ?? "";
    return items.filter((item) => tagName in item.tags);
  }

  const lowered = trimmed.toLowerCase();
  return items.filter((item) => item.text.toLowerCase().includes(lowered) || item.content.toLowerCase().includes(lowered));
}

export function addTaskToTaskPaperText(
  taskpaperText: string,
  input: { text: string; project?: string; append?: boolean; createProject?: boolean }
): string {
  const task = normalizeTaskLine(input.text);
  const hasTrailingNewline = taskpaperText.endsWith("\n");
  const lines = taskpaperText.split("\n");
  if (hasTrailingNewline) {
    lines.pop();
  }

  if (!input.project) {
    lines.push(task);
    return `${lines.join("\n")}\n`;
  }

  const projectLineIndex = lines.findIndex((line) => line.trim() === `${input.project}:`);
  if (projectLineIndex === -1) {
    if (!input.createProject) {
      throw new Error(`Project not found: ${input.project}`);
    }
    lines.push(`${input.project}:`, `\t${task}`);
    return `${lines.join("\n")}\n`;
  }

  const projectIndent = lines[projectLineIndex]?.match(/^\s*/)?.[0] ?? "";
  const childIndent = `${projectIndent}\t`;
  let insertIndex = projectLineIndex + 1;

  if (input.append ?? true) {
    insertIndex = lines.length;
    for (let index = projectLineIndex + 1; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      if (line.trim() && !line.startsWith(childIndent)) {
        insertIndex = index;
        break;
      }
    }
  }

  lines.splice(insertIndex, 0, `${childIndent}${task}`);
  return `${lines.join("\n")}\n`;
}

export function completeTaskInTaskPaperText(
  taskpaperText: string,
  input: { query: string; date: string }
): { completed: number; line?: number; text: string } {
  const item = searchTaskPaperText(taskpaperText, input.query).find((candidate) => candidate.type === "task");
  if (!item) {
    return { completed: 0, text: taskpaperText };
  }

  const lines = taskpaperText.split("\n");
  const index = item.line - 1;
  const line = lines[index] ?? "";
  if (/@done(?:\([^)]*\))?/.test(line)) {
    lines[index] = line.replace(/@done(?:\([^)]*\))?/, `@done(${input.date})`);
  } else {
    lines[index] = `${line} @done(${input.date})`;
  }
  return { completed: 1, line: item.line, text: lines.join("\n") };
}

export function listProjectsInTaskPaperText(taskpaperText: string): TaskPaperProject[] {
  return parseTaskPaperText(taskpaperText)
    .filter((item) => item.type === "project")
    .map((item) => ({ line: item.line, name: item.content, depth: item.depth }));
}

function projectNameForLine(items: TaskPaperItem[], line: number): string | undefined {
  let current: TaskPaperItem | undefined;
  for (const item of items) {
    if (item.line >= line) {
      break;
    }
    if (item.type === "project") {
      current = item;
    }
  }
  return current?.content;
}

export function archiveDoneInTaskPaperText(
  taskpaperText: string,
  archiveProject: string
): { archived: number; text: string } {
  const items = parseTaskPaperText(taskpaperText);
  const doneTasks = items.filter(
    (item) => item.type === "task" && "done" in item.tags && projectNameForLine(items, item.line) !== archiveProject
  );

  if (doneTasks.length === 0) {
    return { archived: 0, text: taskpaperText };
  }

  const lines = taskpaperText.endsWith("\n") ? taskpaperText.split("\n").slice(0, -1) : taskpaperText.split("\n");
  const removeLines = new Set(doneTasks.map((item) => item.line));
  const movedLines = doneTasks.map((item) => `\t${item.text}`);
  const remaining = lines.filter((_line, index) => !removeLines.has(index + 1));
  const archiveIndex = remaining.findIndex((line) => line.trim() === `${archiveProject}:`);

  if (archiveIndex === -1) {
    remaining.push(`${archiveProject}:`, ...movedLines);
  } else {
    let insertIndex = remaining.length;
    for (let index = archiveIndex + 1; index < remaining.length; index += 1) {
      const line = remaining[index] ?? "";
      if (line.trim() && !line.startsWith("\t")) {
        insertIndex = index;
        break;
      }
    }
    remaining.splice(insertIndex, 0, ...movedLines);
  }

  return { archived: doneTasks.length, text: `${remaining.join("\n")}\n` };
}

const searchItemsScript = String(function TaskPaperContextScript(
  editor: any,
  options: { query: string }
) {
  const outline = editor.outline;
  const items = outline.evaluateItemPath(options.query);
  return JSON.stringify(
    items.map((item: any) => ({
      id: item.id,
      text: item.bodyString,
      content: item.bodyContentString,
      type: item.getAttribute("data-type") ?? item.getAttribute("type"),
      attributes: item.attributes,
      depth: item.depth
    }))
  );
});

const readFrontDocumentScript = String(function TaskPaperContextScript(editor: any) {
  return JSON.stringify(editor.outline.serialize());
});

const addTaskScript = String(function TaskPaperContextScript(
  editor: any,
  options: { text: string; project?: string; append: boolean; createProject: boolean }
) {
  const outline = editor.outline;
  const root = outline.root;
  const items = ItemSerializer.deserializeItems(options.text, outline, ItemSerializer.TEXTMimeType);
  let parent = root;

  if (options.project) {
    parent = outline.evaluateItemPath(`/project ${options.project}`)[0];
    if (!parent && options.createProject) {
      parent = outline.createItem(`${options.project}:`);
      root.appendChildren(parent);
    }
    if (!parent) {
      throw new Error(`Project not found: ${options.project}`);
    }
  }

  if (options.append) {
    parent.appendChildren(items);
  } else {
    parent.insertChildrenBefore(items, parent.firstChild);
  }

  return JSON.stringify({ added: items.length });
});

const completeTaskScript = String(function TaskPaperContextScript(
  editor: any,
  options: { query: string; date: string }
) {
  const outline = editor.outline;
  const item = outline.evaluateItemPath(options.query)[0];
  if (!item) {
    return JSON.stringify({ completed: 0 });
  }
  item.setAttribute("done", options.date);
  return JSON.stringify({ completed: 1, id: item.id });
});

const setFilterScript = String(function TaskPaperContextScript(editor: any, options: { query: string }) {
  editor.itemPathFilter = options.query;
  return JSON.stringify({ filter: editor.itemPathFilter });
});

const statusScript = `
try {
  const taskpaper = Application("TaskPaper");
  JSON.stringify({
    installed: true,
    running: taskpaper.running(),
    documents: taskpaper.documents.length
  });
} catch (error) {
  JSON.stringify({
    installed: false,
    running: false,
    documents: 0,
    error: String(error)
  });
}
`;

const frontDocumentInfoScript = `
const taskpaper = Application("TaskPaper");
const document = taskpaper.documents[0];
let file = null;
try {
  const documentFile = document.file();
  file = documentFile === null ? null : String(documentFile);
} catch (error) {
  file = null;
}
JSON.stringify({
  name: document.name(),
  file,
  modified: document.modified()
});
`;

export function createTaskPaperTools(bridge: TaskPaperBridge, options: TaskPaperToolsOptions = {}) {
  const fileSystem = options.fileSystem ?? { readFile, writeFile };

  return {
    async status() {
      return bridge.runJxa(statusScript);
    },
    async readFrontDocument() {
      const documentInfo = (await bridge.runJxa(frontDocumentInfoScript)) as { file?: string | null };
      if (documentInfo.file) {
        return {
          text: await fileSystem.readFile(documentInfo.file, "utf8"),
          file: documentInfo.file
        };
      }
      const text = await bridge.evaluate(readFrontDocumentScript);
      return { text };
    },
    async readFile(input: { file: string }) {
      return {
        file: input.file,
        text: await fileSystem.readFile(input.file, "utf8")
      };
    },
    async searchItems(input: { file?: string; query: string }) {
      if (input.file) {
        return {
          file: input.file,
          items: searchTaskPaperText(await fileSystem.readFile(input.file, "utf8"), input.query).filter(
            (item) => item.type === "task"
          )
        };
      }
      const items = await bridge.evaluate(searchItemsScript, { query: input.query });
      return { items };
    },
    async addTask(input: { file?: string; text: string; project?: string; append?: boolean; createProject?: boolean }) {
      if (input.file) {
        const existing = await fileSystem.readFile(input.file, "utf8");
        const next = addTaskToTaskPaperText(existing, {
          text: input.text,
          project: input.project,
          append: input.append,
          createProject: input.createProject ?? true
        });
        await fileSystem.writeFile(input.file, next, "utf8");
        return { added: 1, file: input.file };
      }

      const documentInfo = (await bridge.runJxa(frontDocumentInfoScript)) as { file?: string | null };
      if (documentInfo.file) {
        const existing = await fileSystem.readFile(documentInfo.file, "utf8");
        const next = addTaskToTaskPaperText(existing, {
          text: input.text,
          project: input.project,
          append: input.append,
          createProject: input.createProject ?? true
        });
        await fileSystem.writeFile(documentInfo.file, next, "utf8");
        return { added: 1, file: documentInfo.file };
      }

      return bridge.evaluate(addTaskScript, {
        text: normalizeTaskLine(input.text),
        project: input.project,
        append: input.append ?? true,
        createProject: input.createProject ?? true
      });
    },
    async completeTask(input: { file?: string; query: string; date?: string }) {
      const date = input.date ?? new Date().toISOString().slice(0, 10);
      if (input.file) {
        const result = completeTaskInTaskPaperText(await fileSystem.readFile(input.file, "utf8"), {
          query: input.query,
          date
        });
        if (result.completed) {
          await fileSystem.writeFile(input.file, result.text, "utf8");
        }
        return { completed: result.completed, file: input.file, line: result.line };
      }
      return bridge.evaluate(completeTaskScript, {
        query: input.query,
        date
      });
    },
    async listProjects(input: { file: string }) {
      return {
        file: input.file,
        projects: listProjectsInTaskPaperText(await fileSystem.readFile(input.file, "utf8"))
      };
    },
    async archiveDone(input: { file: string; archiveProject?: string }) {
      const result = archiveDoneInTaskPaperText(
        await fileSystem.readFile(input.file, "utf8"),
        input.archiveProject ?? "Archive"
      );
      if (result.archived) {
        await fileSystem.writeFile(input.file, result.text, "utf8");
      }
      return { archived: result.archived, file: input.file };
    },
    async setFilter(input: { query: string }) {
      return bridge.evaluate(setFilterScript, { query: input.query });
    }
  };
}
