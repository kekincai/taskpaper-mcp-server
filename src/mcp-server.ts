import { z } from "zod";

export interface TaskPaperToolHandlers {
  status(): Promise<unknown>;
  readFrontDocument(): Promise<unknown>;
  searchItems(input: { query: string }): Promise<unknown>;
  addTask(input: { file?: string; text: string; project?: string; append?: boolean; createProject?: boolean }): Promise<unknown>;
  completeTask(input: { query: string; date?: string }): Promise<unknown>;
  setFilter(input: { query: string }): Promise<unknown>;
}

export interface ToolRegistrar {
  registerTool(name: string, config: unknown, callback: (args: any) => Promise<unknown>): unknown;
}

export function toJsonText(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }]
  };
}

export function registerTaskPaperTools(server: ToolRegistrar, tools: TaskPaperToolHandlers): void {
  server.registerTool(
    "taskpaper_status",
    {
      title: "TaskPaper Status",
      description: "Check whether TaskPaper is installed/running and count open documents."
    },
    async () => toJsonText(await tools.status())
  );

  server.registerTool(
    "taskpaper_read_front_document",
    {
      title: "Read Front TaskPaper Document",
      description: "Read the serialized text of the front TaskPaper document."
    },
    async () => toJsonText(await tools.readFrontDocument())
  );

  server.registerTool(
    "taskpaper_search_items",
    {
      title: "Search TaskPaper Items",
      description: "Search the front TaskPaper document with TaskPaper item path/search syntax.",
      inputSchema: {
        query: z.string().min(1).describe('TaskPaper query, for example "not @done" or "/project Inbox//*"')
      }
    },
    async (args: { query: string }) => toJsonText(await tools.searchItems(args))
  );

  server.registerTool(
    "taskpaper_add_task",
    {
      title: "Add TaskPaper Task",
      description: "Add a task to the root or a named project in the front TaskPaper document.",
      inputSchema: {
        text: z.string().min(1),
        file: z.string().min(1).optional(),
        project: z.string().min(1).optional(),
        append: z.boolean().optional(),
        createProject: z.boolean().optional()
      }
    },
    async (args: { file?: string; text: string; project?: string; append?: boolean; createProject?: boolean }) =>
      toJsonText(await tools.addTask(args))
  );

  server.registerTool(
    "taskpaper_complete_task",
    {
      title: "Complete TaskPaper Task",
      description: "Mark the first item matching a TaskPaper query as done.",
      inputSchema: {
        query: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      }
    },
    async (args: { query: string; date?: string }) => toJsonText(await tools.completeTask(args))
  );

  server.registerTool(
    "taskpaper_set_filter",
    {
      title: "Set TaskPaper Filter",
      description: "Set the item path filter on the front TaskPaper document.",
      inputSchema: {
        query: z.string().min(1)
      }
    },
    async (args: { query: string }) => toJsonText(await tools.setFilter(args))
  );
}
