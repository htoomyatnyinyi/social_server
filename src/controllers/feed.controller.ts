import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { PostService } from "../services/post.service";

export const feedController = new Elysia({ prefix: "/posts/feed" })
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
  .get("/", async ({ query, user, set }) => {
    if (!user) {
      // Return empty if not logged in, or 401? Original code returned []
      return [];
    }

    // @ts-ignore
    const { cursor, limit } = query;
    // @ts-ignore
    const userId = user.id;

    return await PostService.getFeed(
      userId,
      cursor as string,
      parseInt(limit as any) || 20,
    );
  });
