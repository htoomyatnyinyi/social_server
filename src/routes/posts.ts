import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import prisma from "../lib/prisma";
import cloudinary from "../lib/cloudinary";

export const postRoutes = new Elysia({ prefix: "/posts" })
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
  .get("/", async () => {
    return await prisma.post.findMany({
      include: {
        author: {
          select: { id: true, name: true, image: true },
        },
        likes: true,
        comments: {
          include: {
            user: { select: { id: true, name: true, image: true } },
          },
        },
        _count: {
          select: { likes: true, comments: true, shares: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  })
  .post(
    "/",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { message: "Unauthorized" };
      }

      const { content, image } = body;
      let imageUrl = null;

      if (image) {
        const uploadResponse = await cloudinary.uploader.upload(image, {
          folder: "social_app/posts",
        });
        imageUrl = uploadResponse.secure_url;
      }

      const post = await prisma.post.create({
        data: {
          content,
          image: imageUrl,
          authorId: user.id as string,
        },
        include: {
          author: { select: { id: true, name: true, image: true } },
        },
      });

      return post;
    },
    {
      body: t.Object({
        content: t.Optional(t.String()),
        image: t.Optional(t.String()), // Base64 or URL
      }),
    },
  )
  .post("/:id/like", async ({ params: { id }, user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    const userId = user.id as string;

    const existingLike = await prisma.like.findUnique({
      where: {
        userId_postId: {
          userId,
          postId: id,
        },
      },
    });

    if (existingLike) {
      await prisma.like.delete({
        where: { id: existingLike.id },
      });
      return { message: "Unliked" };
    }

    await prisma.like.create({
      data: {
        userId,
        postId: id,
      },
    });

    return { message: "Liked" };
  })
  .post(
    "/:id/comment",
    async ({ params: { id }, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { message: "Unauthorized" };
      }

      const { content } = body;

      const comment = await prisma.comment.create({
        data: {
          content,
          userId: user.id as string,
          postId: id,
        },
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      });

      return comment;
    },
    {
      body: t.Object({
        content: t.String(),
      }),
    },
  );
