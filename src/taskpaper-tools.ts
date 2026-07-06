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

export function normalizeTaskLine(text: string): string {
  const trimmed = text.trim();
  if (/^[-+*]\s/.test(trimmed)) {
    return trimmed;
  }
  return `- ${trimmed}`;
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
    async searchItems(input: { query: string }) {
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
    async completeTask(input: { query: string; date?: string }) {
      return bridge.evaluate(completeTaskScript, {
        query: input.query,
        date: input.date ?? new Date().toISOString().slice(0, 10)
      });
    },
    async setFilter(input: { query: string }) {
      return bridge.evaluate(setFilterScript, { query: input.query });
    }
  };
}
