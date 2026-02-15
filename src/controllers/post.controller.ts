import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { PostService } from "../services/post.service";

export const postController = new Elysia({ prefix: "/posts" })
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
  .get("/:id", async ({ params: { id }, user, set }) => {
    // @ts-ignore
    const userId = user?.id || null;
    const post = await PostService.getPost(id, userId);

    if (!post) {
      set.status = 404;
      return { message: "Post not found" };
    }

    // Access control
    if (!post.isPublic && (!user || post.authorId !== userId)) {
      set.status = 403;
      return { message: "Forbidden" };
    }

    return post;
  })
  .post(
    "/",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { message: "Unauthorized" };
      }

      // @ts-ignore
      const { content, image, isPublic } = body;
      // @ts-ignore
      const userId = user.id;

      try {
        const post = await PostService.createPost(
          userId,
          content,
          image,
          isPublic,
        );
        return post;
      } catch (error: any) {
        set.status = 400;
        return { message: error.message };
      }
    },
    {
      body: t.Object({
        content: t.Optional(t.String()),
        image: t.Optional(t.String()),
        isPublic: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete("/:id", async ({ params: { id }, user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    try {
      // @ts-ignore
      return await PostService.deletePost(id, user.id);
    } catch (error: any) {
      set.status = error.message === "Forbidden" ? 403 : 404;
      return { message: error.message };
    }
  })
  .get("/", async ({ query, user, set }) => {
    // @ts-ignore
    const { type, cursor, limit } = query;
    const userId = user ? (user as any).id : null;

    try {
      return await PostService.getPostsByType(
        type as string,
        userId,
        cursor as string,
        parseInt(limit as any) || 20,
      );
    } catch (error: any) {
      set.status = error.message === "Unauthorized" ? 401 : 400;
      return { message: error.message };
    }
  });
