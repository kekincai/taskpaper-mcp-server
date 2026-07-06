#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTaskPaperBridge } from "./taskpaper-bridge.js";
import { createTaskPaperTools } from "./taskpaper-tools.js";
import { registerTaskPaperTools, type ToolRegistrar } from "./mcp-server.js";

export function createServer() {
  const server = new McpServer({
    name: "taskpaper-mcp-server",
    version: "1.0.0"
  });

  const bridge = createTaskPaperBridge();
  const tools = createTaskPaperTools(bridge);
  registerTaskPaperTools(server as ToolRegistrar, tools);

  return server;
}

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
