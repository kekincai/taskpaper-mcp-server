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
- `taskpaper_search_items` - search the front document with TaskPaper item path/search syntax
- `taskpaper_add_task` - add a task to root or a named project
- `taskpaper_complete_task` - mark the first matching item as `@done(yyyy-mm-dd)`
- `taskpaper_set_filter` - set the front document's TaskPaper filter

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
