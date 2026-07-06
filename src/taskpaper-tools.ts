export interface TaskPaperBridge {
  evaluate(taskpaperFunction: string, options?: unknown): Promise<unknown>;
  runJxa(script: string): Promise<unknown>;
}

declare const ItemSerializer: any;

export function normalizeTaskLine(text: string): string {
  const trimmed = text.trim();
  if (/^[-+*]\s/.test(trimmed)) {
    return trimmed;
  }
  return `- ${trimmed}`;
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

export function createTaskPaperTools(bridge: TaskPaperBridge) {
  return {
    async status() {
      return bridge.runJxa(statusScript);
    },
    async readFrontDocument() {
      const text = await bridge.evaluate(readFrontDocumentScript);
      return { text };
    },
    async searchItems(input: { query: string }) {
      const items = await bridge.evaluate(searchItemsScript, { query: input.query });
      return { items };
    },
    async addTask(input: { text: string; project?: string; append?: boolean; createProject?: boolean }) {
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
