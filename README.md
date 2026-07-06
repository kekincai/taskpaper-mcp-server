# taskpaper-mcp-server

Model Context Protocol server for automating [TaskPaper](https://www.taskpaper.com/) on macOS.

This server talks to TaskPaper through JavaScript for Automation (`osascript -l JavaScript`) and TaskPaper's `document.evaluate({ script, withOptions })` bridge. It exposes a small set of safe, fixed tools rather than arbitrary TaskPaper JavaScript execution.

## Requirements

- macOS
- TaskPaper installed
- Node.js 20+
- Automation permission for the MCP host to control TaskPaper

## Tools

- `taskpaper_status` - check install/running status and open document count
- `taskpaper_read_front_document` - read the front document as TaskPaper text
- `taskpaper_read_file` - read a `.taskpaper` file from disk
- `taskpaper_search_items` - search tasks. Pass `file` to search a `.taskpaper` file directly
- `taskpaper_add_task` - add a task to root or a named project. Pass `file` to edit a `.taskpaper` file directly; otherwise it tries the front TaskPaper document.
- `taskpaper_complete_task` - mark the first matching task as `@done(yyyy-mm-dd)`. Pass `file` to edit a `.taskpaper` file directly
- `taskpaper_list_projects` - list projects in a `.taskpaper` file
- `taskpaper_archive_done` - move done tasks into an archive project in a `.taskpaper` file
- `taskpaper_set_filter` - set the front document's TaskPaper filter

For reliability, prefer passing an explicit `file` path. TaskPaper window ordering is not stable enough to make front-document writes the primary workflow.

## Development

```bash
npm install
npm test
npm run build
```

Run locally over stdio:

```bash
npm run build
node dist/server.js
```

Example MCP configuration:

```json
{
  "mcpServers": {
    "taskpaper": {
      "command": "node",
      "args": ["/absolute/path/to/taskpaper-mcp-server/dist/server.js"]
    }
  }
}
```

Example direct file write:

```json
{
  "file": "/Users/you/tasks.taskpaper",
  "project": "Inbox",
  "text": "Buy milk @due(today)"
}
```

Example complete task in a file:

```json
{
  "file": "/Users/you/tasks.taskpaper",
  "query": "Buy milk",
  "date": "2026-07-07"
}
```

Example archive done tasks:

```json
{
  "file": "/Users/you/tasks.taskpaper",
  "archiveProject": "Archive"
}
```
