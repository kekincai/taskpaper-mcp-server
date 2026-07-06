import { z } from "zod";

export interface TaskPaperToolHandlers {
  status(): Promise<unknown>;
  readFrontDocument(): Promise<unknown>;
  readFile(input: { file: string }): Promise<unknown>;
  searchItems(input: { file?: string; query: string }): Promise<unknown>;
  addTask(input: { file?: string; text: string; project?: string; append?: boolean; createProject?: boolean }): Promise<unknown>;
  completeTask(input: { file?: string; query: string; date?: string }): Promise<unknown>;
  listProjects(input: { file: string }): Promise<unknown>;
  archiveDone(input: { file: string; archiveProject?: string }): Promise<unknown>;
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
    "taskpaper_read_file",
    {
      title: "Read TaskPaper File",
      description: "Read a TaskPaper file from disk.",
      inputSchema: {
        file: z.string().min(1)
      }
    },
    async (args: { file: string }) => toJsonText(await tools.readFile(args))
  );

  server.registerTool(
    "taskpaper_search_items",
    {
      title: "Search TaskPaper Items",
      description: "Search TaskPaper items. Pass file to search a .taskpaper file directly.",
      inputSchema: {
        file: z.string().min(1).optional(),
        query: z.string().min(1).describe('TaskPaper query, for example "not @done" or "/project Inbox//*"')
      }
    },
    async (args: { file?: string; query: string }) => toJsonText(await tools.searchItems(args))
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
      description: "Mark the first item matching a TaskPaper query as done. Pass file to edit a .taskpaper file directly.",
      inputSchema: {
        file: z.string().min(1).optional(),
        query: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      }
    },
    async (args: { file?: string; query: string; date?: string }) => toJsonText(await tools.completeTask(args))
  );

  server.registerTool(
    "taskpaper_list_projects",
    {
      title: "List TaskPaper Projects",
      description: "List projects in a TaskPaper file.",
      inputSchema: {
        file: z.string().min(1)
      }
    },
    async (args: { file: string }) => toJsonText(await tools.listProjects(args))
  );

  server.registerTool(
    "taskpaper_archive_done",
    {
      title: "Archive Done TaskPaper Tasks",
      description: "Move done tasks in a TaskPaper file into an archive project.",
      inputSchema: {
        file: z.string().min(1),
        archiveProject: z.string().min(1).optional()
      }
    },
    async (args: { file: string; archiveProject?: string }) => toJsonText(await tools.archiveDone(args))
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
