import { Elysia } from "elysia";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { postReplyTool } from "./tools/posts";

const mcp = new McpServer({ name: "SocialBot", version: "1.0.0" });

// Register the tool we defined earlier
mcp.tool(postReplyTool.name, postReplyTool.schema, postReplyTool.execute);

export const mcpPlugin = new Elysia()
  .get("/mcp/sse", async ({ set }) => {
    const transport = new SSEServerTransport("/mcp/messages", set as any);
    await mcp.connect(transport);
  })
  .post("/mcp/messages", async ({ request }) => {
    // Handle incoming AI commands
  });
