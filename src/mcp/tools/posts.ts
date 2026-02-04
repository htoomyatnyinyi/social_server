import { t } from "elysia";
import { postService } from "../../modules/posts/service";

export const postReplyTool = {
  name: "post_reply",
  schema: {
    parentPostId: t.String(),
    content: t.String(),
  },
  execute: async ({ parentPostId, content }) => {
    const reply = await postService.createReply(
      parentPostId,
      content,
      "AI_AGENT_ID",
    );
    return {
      content: [{ type: "text", text: `Replied with post ID: ${reply.id}` }],
    };
  },
};
