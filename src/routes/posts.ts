import { Elysia } from "elysia";
import { postController } from "../controllers/post.controller";
import { feedController } from "../controllers/feed.controller";
import { interactionController } from "../controllers/interaction.controller";

// The controllers already have prefixes:
// postController -> /posts
// feedController -> /posts/feed
// interactionController -> /posts

// Since feedController is more specific, mounting order matters if patterns overlap,
// but here they are:
// feed: /posts/feed (exact)
// post: /posts/:id (parametric)
// interaction: /posts/:id/... (parametric)

// Elysia matches in order.
// We should mount feedController first so /posts/feed isn't caught by /posts/:id (where id="feed")

export const postRoutes = new Elysia()
  .use(feedController)
  .use(interactionController)
  .use(postController);
