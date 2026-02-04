import { Elysia } from "elysia";
import { aiAgent } from "../ai/agent";

export const postController = new Elysia({ prefix: "/posts" }).post(
  "/",
  async ({ body }) => {
    const newPost = await postService.create(body);

    // If the post mentions @ai, trigger the background agent
    if (newPost.content.includes("@ai")) {
      // Don't 'await' this so the user gets a fast response
      aiAgent.handleMention(newPost);
    }

    return newPost;
  },
);
