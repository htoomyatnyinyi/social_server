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
  .get("/:id", async ({ params: { id } }) => {
    return await prisma.post.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, name: true, username: true, image: true },
        },
        likes: true,
        originalPost: {
          include: {
            author: {
              select: { id: true, name: true, username: true, image: true },
            },
          },
        },
        _count: {
          select: { likes: true, comments: true, shares: true, reposts: true },
        },
      },
    });
  })
  .get("/", async ({ query }) => {
    const { type } = query;
    const where = type === "private" ? { isPublic: false } : { isPublic: true };

    return await prisma.post.findMany({
      where,
      include: {
        author: {
          select: { id: true, name: true, username: true, image: true },
        },
        likes: true,
        originalPost: {
          include: {
            author: {
              select: { id: true, name: true, username: true, image: true },
            },
          },
        },
        comments: {
          where: { parentId: null },
          include: {
            user: {
              select: { id: true, name: true, username: true, image: true },
            },
            replies: {
              include: {
                user: {
                  select: { id: true, name: true, username: true, image: true },
                },
              },
            },
          },
          take: 3,
        },
        _count: {
          select: { likes: true, comments: true, shares: true, reposts: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  })
  .get("/:id/comments", async ({ params: { id } }) => {
    return await prisma.comment.findMany({
      where: { postId: id, parentId: null },
      include: {
        user: { select: { id: true, name: true, username: true, image: true } },
        replies: {
          include: {
            user: {
              select: { id: true, name: true, username: true, image: true },
            },
          },
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

      const { content, image, isPublic } = body;
      let imageUrl = null;

      if (image && image.startsWith("data:image")) {
        const uploadResponse = await cloudinary.uploader.upload(image, {
          folder: "social_app/posts",
        });
        imageUrl = uploadResponse.secure_url;
      } else if (image) {
        imageUrl = image;
      }

      const post = await prisma.post.create({
        data: {
          content,
          image: imageUrl,
          isPublic: isPublic ?? true,
          authorId: user.id as string,
        },
        include: {
          author: {
            select: { id: true, name: true, username: true, image: true },
          },
        },
      });

      return post;
    },
    {
      body: t.Object({
        content: t.Optional(t.String()),
        image: t.Optional(t.String()),
        isPublic: t.Optional(t.Boolean()),
      }),
    },
  )
  .post(
    "/:id/repost",
    async ({ params: { id }, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { message: "Unauthorized" };
      }

      const { content, image } = body;

      const originalPost = await prisma.post.findUnique({
        where: { id },
      });

      if (!originalPost) {
        set.status = 404;
        return { message: "Original post not found" };
      }

      let imageUrl = null;
      if (image && image.startsWith("data:image")) {
        const uploadResponse = await cloudinary.uploader.upload(image, {
          folder: "social_app/posts",
        });
        imageUrl = uploadResponse.secure_url;
      }

      const repost = await prisma.post.create({
        data: {
          content: content || undefined,
          image: imageUrl || undefined,
          isRepost: true, // It is still technically a repost/quote
          originalPostId: id,
          authorId: user.id as string,
          isPublic: true,
        },
        include: {
          author: {
            select: { id: true, name: true, username: true, image: true },
          },
          originalPost: {
            include: {
              author: {
                select: { id: true, name: true, username: true, image: true },
              },
            },
          },
        },
      });

      if (originalPost.authorId !== (user.id as string)) {
        await prisma.notification.create({
          data: {
            type: content ? "QUOTE" : "REPOST", // Differentiate for notification if needed, or just REPOST
            recipientId: originalPost.authorId,
            issuerId: user.id as string,
            postId: originalPost.id, // Notification links to original post
          },
        });
      }

      return repost;
    },
    {
      body: t.Object({
        content: t.Optional(t.String()),
        image: t.Optional(t.String()),
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

    const post = await prisma.post.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (post && post.authorId !== userId) {
      await prisma.notification.create({
        data: {
          type: "LIKE",
          recipientId: post.authorId,
          issuerId: userId,
          postId: id,
        },
      });
    }

    return { message: "Liked" };
  })
  .post("/:id/view", async ({ params: { id }, set }) => {
    // Increment view count for a post
    try {
      await prisma.post.update({
        where: { id },
        data: {
          views: {
            increment: 1,
          },
        },
      });

      return { message: "View count incremented" };
    } catch (error) {
      set.status = 404;
      return { message: "Post not found" };
    }
  })
  .delete("/:id", async ({ params: { id }, user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      set.status = 404;
      return { message: "Post not found" };
    }

    if (post.authorId !== (user.id as string)) {
      set.status = 403;
      return { message: "Forbidden" };
    }

    await prisma.post.delete({
      where: { id },
    });

    return { message: "top post deleted" };
  })
  .post(
    "/:id/comment",
    async ({ params: { id }, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { message: "Unauthorized" };
      }

      const { content, parentId } = body;

      const comment = await prisma.comment.create({
        data: {
          content,
          userId: user.id as string,
          postId: id,
          parentId: parentId || null,
        },
        include: {
          user: {
            select: { id: true, name: true, username: true, image: true },
          },
          post: { select: { authorId: true } },
          parent: { select: { userId: true } },
        },
      });

      const currentUserId = user.id as string;

      // Notify post author
      if (comment.post.authorId !== currentUserId) {
        await prisma.notification.create({
          data: {
            type: "COMMENT",
            recipientId: comment.post.authorId,
            issuerId: currentUserId,
            postId: id,
            commentId: comment.id,
          },
        });
      }

      // Notify parent comment author if it's a reply
      if (comment.parent && comment.parent.userId !== currentUserId) {
        await prisma.notification.create({
          data: {
            type: "REPLY",
            recipientId: comment.parent.userId,
            issuerId: currentUserId,
            postId: id,
            commentId: comment.id,
          },
        });
      }

      return comment;
    },
    {
      body: t.Object({
        content: t.String(),
        parentId: t.Optional(t.String()),
      }),
    },
  );
