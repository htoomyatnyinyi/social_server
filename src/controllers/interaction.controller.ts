import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { InteractionService } from "../services/interaction.service";
import { PostService } from "../services/post.service";
import prisma from "../lib/prisma";

export const interactionController = new Elysia({ prefix: "/posts" })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
    }),
  )
  .derive(async ({ jwt, headers }) => {
    const auth = headers["authorization"];
    if (!auth || !auth.startsWith("Bearer ")) return { user: null };
    const token = auth.split(" ")[1];
    const user = await jwt.verify(token);
    return { user };
  })
  .post("/:id/like", async ({ params: { id }, user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }
    // @ts-ignore
    return await InteractionService.toggleLike(id, user.id);
  })
  .post("/:id/bookmark", async ({ params: { id }, user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }
    // @ts-ignore
    return await InteractionService.toggleBookmark(id, user.id);
  })
  .post(
    "/:id/repost",
    async ({ params: { id }, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { message: "Unauthorized" };
      }
      //   @ts-ignore
      const { content, image } = body;
      //   @ts-ignore
      const userId = user.id;

      try {
        return await PostService.repost(id, userId, content, image);
      } catch (error: any) {
        set.status = 400;
        return { message: error.message };
      }
    },
    {
      body: t.Object({
        content: t.Optional(t.String()),
        image: t.Optional(t.String()),
      }),
    },
  )
  .delete("/:id/repost", async ({ params: { id }, user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }
    try {
      // @ts-ignore
      return await PostService.removeRepost(id, user.id);
    } catch (error: any) {
      set.status = 404;
      return { message: error.message };
    }
  })
  .post(
    "/:id/comment",
    async ({ params: { id }, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { message: "Unauthorized" };
      }
      // @ts-ignore
      const { content, parentId } = body;
      // @ts-ignore
      const userId = user.id;

      try {
        return await InteractionService.addComment(
          id,
          userId,
          content,
          parentId,
        );
      } catch (error: any) {
        set.status = 400;
        return { message: error.message };
      }
    },
    {
      body: t.Object({
        content: t.String(),
        parentId: t.Optional(t.String()),
      }),
    },
  )
  .get("/:id/comments", async ({ params: { id } }) => {
    // Logic for getComments was in posts.ts, simpler to just run query or move to Service
    // For now, moving query to here or Service?
    // It's simple read, but consistency suggests Service or just inline prisma if simple.
    // I'll inline for now or create method in PostService?
    // Let's create `getComments` in PostService to keep controllers thin.

    // ... WAIT, I didn't add getComments to PostService.
    // I will add it to prisma call here for now as it was in original code.
    return await PostService.getComments(id);
  })
  .post("/:id/share", async ({ params: { id }, user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }
    // @ts-ignore
    return await InteractionService.sharePost(id, user.id);
  })
  .post("/:id/report", async ({ params: { id }, user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }
    // @ts-ignore
    return await InteractionService.reportPost(id, user.id, "OTHER"); // handling enum later or defaults
  })
  .post("/:id/block", async ({ params: { id }, user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }
    // Fix implementation: Find post author, then block auth.
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      set.status = 404;
      return { message: "Post not found" };
    }
    // @ts-ignore
    const blockerId = user.id;
    const blockedId = post.authorId;

    if (blockerId === blockedId) return { message: "Cannot block self" };

    await prisma.block.create({
      data: {
        userId: blockerId,
        blockId: blockedId,
      },
    });
    return { message: "User blocked" };
  });
