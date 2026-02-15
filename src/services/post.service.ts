import prisma from "../lib/prisma";
import cloudinary from "../lib/cloudinary";
import { generateAIResponse, moderateContent } from "../lib/ai";
import redis from "../lib/redis";

export const getPostInclude = (userId: string | null) => ({
  author: {
    select: { id: true, name: true, username: true, image: true },
  },
  likes: {
    where: { userId: userId ?? "dummy" },
    select: { userId: true },
  },
  repostedBy: {
    where: { userId: userId ?? "dummy" },
    select: { userId: true },
  },
  bookmarks: {
    where: { userId: userId ?? "dummy" },
    select: { userId: true },
  },
  originalPost: {
    include: {
      author: {
        select: { id: true, name: true, username: true, image: true },
      },
    },
  },
  _count: {
    select: { likes: true, comments: true, shares: true, quotes: true },
  },
});

export const PostService = {
  async getPost(id: string, userId: string | null) {
    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, name: true, username: true, image: true },
        },
        likes: true,
        bookmarks: {
          where: { userId: userId ? userId : undefined },
          select: { userId: true },
        },
        originalPost: {
          include: {
            author: {
              select: { id: true, name: true, username: true, image: true },
            },
          },
        },
        _count: {
          select: { likes: true, comments: true, shares: true, quotes: true },
        },
        repostedBy: {
          where: { userId: userId ? userId : undefined },
          select: { userId: true },
        },
      },
    });
    return post;
  },

  async createPost(
    userId: string,
    content?: string,
    image?: string,
    isPublic: boolean = true,
  ) {
    // Moderate content
    if (content && (await moderateContent(content))) {
      throw new Error("Content violates guidelines");
    }

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
        isPublic,
        authorId: userId,
      },
      include: {
        author: {
          select: { id: true, name: true, username: true, image: true },
        },
      },
    });

    // Background tasks: Mentions & AI
    this.handlePostSideEffects(post, userId, content);

    return post;
  },

  async handlePostSideEffects(post: any, userId: string, content?: string) {
    if (!content) return;
    try {
      const mentionMatches = content.match(/@(\w+)/g) || [];
      for (const match of mentionMatches) {
        const username = match.slice(1);
        const mentionedUser = await prisma.user.findUnique({
          where: { username },
        });

        if (mentionedUser && mentionedUser.id !== userId) {
          await prisma.mention.create({
            data: { userId: mentionedUser.id, postId: post.id },
          });

          await prisma.notification.create({
            data: {
              type: "MENTION",
              recipientId: mentionedUser.id,
              issuerId: userId,
              postId: post.id,
            },
          });

          // Special: @grok
          if (username === "grok") {
            const question = content.replace(/@grok\s*/i, "").trim();
            if (question) {
              const prompt = `Answer this question about the post: "${question}". Post content: "${post.content || ""}"`;
              const aiResponse = await generateAIResponse(prompt);
              const botUser = await prisma.user.findUnique({
                where: { username: "grok" },
              });
              if (botUser) {
                await prisma.comment.create({
                  data: {
                    content: aiResponse,
                    userId: botUser.id,
                    postId: post.id,
                  },
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Background post processing error:", error);
    }
  },

  async deletePost(id: string, userId: string) {
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) throw new Error("Post not found");
    if (post.authorId !== userId) throw new Error("Forbidden");

    await prisma.post.delete({ where: { id } });
    return { message: "Post deleted" };
  },

  async getFeed(userId: string, cursor?: string, limit: number = 20) {
    const postInclude = getPostInclude(userId);
    const followingKey = `user:${userId}:following`;
    let followingIds = await redis.smembers(followingKey);

    if (followingIds.length === 0) {
      const following = await prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });
      followingIds = following.map((f: any) => f.followingId);
      if (followingIds.length > 0) {
        await redis.sadd(followingKey, ...followingIds);
        await redis.expire(followingKey, 300);
      }
    }

    if (followingIds.length === 0) return { posts: [], nextCursor: null };

    const cursorDate = cursor ? new Date(parseInt(cursor)) : new Date();

    const posts = await prisma.post.findMany({
      where: {
        authorId: { in: followingIds },
        isPublic: true,
        createdAt: { lt: cursorDate },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: postInclude,
    });

    const reposts = await prisma.repost.findMany({
      where: {
        userId: { in: followingIds },
        createdAt: { lt: cursorDate },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: {
          select: { id: true, name: true, username: true, image: true },
        },
        post: {
          include: postInclude,
        },
      },
    });

    const allItems = [...posts, ...reposts].sort(
      (a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    const slicedItems = allItems.slice(0, limit);

    const results = slicedItems.map((item: any) => {
      if (item.post) {
        return {
          ...item.post,
          id: `repost_${item.id}`,
          createdAt: item.createdAt,
          author: item.user,
          isRepost: true,
          originalPost: item.post,
          repostedByMe: item.post.repostedBy.length > 0,
        };
      }
      return {
        ...item,
        repostedByMe: item.repostedBy.length > 0,
      };
    });

    const lastItem = slicedItems[slicedItems.length - 1];
    const nextCursor =
      slicedItems.length === limit
        ? lastItem.createdAt.getTime().toString()
        : null;

    return { posts: results, nextCursor };
  },

  async repost(
    postId: string,
    userId: string,
    content?: string,
    image?: string,
  ) {
    // Moderate content
    if (content && (await moderateContent(content))) {
      throw new Error("Content violates guidelines");
    }

    const originalPost = await prisma.post.findUnique({
      where: { id: postId },
    });
    if (!originalPost) throw new Error("Original post not found");

    // Quote
    if (content || image) {
      let imageUrl = null;
      if (image && image.startsWith("data:image")) {
        const uploadResponse = await cloudinary.uploader.upload(image, {
          folder: "social_app/posts",
        });
        imageUrl = uploadResponse.secure_url;
      }

      const quote = await prisma.post.create({
        data: {
          content,
          image: imageUrl,
          originalPostId: postId,
          authorId: userId,
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

      await prisma.post.update({
        where: { id: postId },
        data: { repostsCount: { increment: 1 } },
      });

      if (originalPost.authorId !== userId) {
        await prisma.notification.create({
          data: {
            type: "QUOTE",
            recipientId: originalPost.authorId,
            issuerId: userId,
            postId: originalPost.id,
          },
        });
      }
      return { ...quote, isQuote: true };
    }

    // Repost
    else {
      const existingRepost = await prisma.repost.findUnique({
        where: { userId_postId: { userId, postId } },
      });

      if (existingRepost) throw new Error("Already reposted");

      const repost = await prisma.repost.create({
        data: { userId, postId },
      });

      await prisma.post.update({
        where: { id: postId },
        data: { repostsCount: { increment: 1 } },
      });

      if (originalPost.authorId !== userId) {
        await prisma.notification.create({
          data: {
            type: "REPOST",
            recipientId: originalPost.authorId,
            issuerId: userId,
            postId: originalPost.id,
          },
        });
      }
      return { ...repost, isQuote: false };
    }
  },

  async removeRepost(postId: string, userId: string) {
    const existingRepost = await prisma.repost.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (!existingRepost) throw new Error("Repost not found");

    await prisma.repost.delete({
      where: { userId_postId: { userId, postId } },
    });

    await prisma.post.update({
      where: { id: postId },
      data: { repostsCount: { decrement: 1 } },
    });

    return { message: "Repost removed" };
  },

  async getPostsByType(
    type: string,
    userId: string | null,
    cursor?: string,
    limit: number = 20,
  ) {
    let where: any = { isPublic: true };
    if (type === "private") {
      if (!userId) throw new Error("Unauthorized");
      where = { isPublic: false, authorId: userId };
    }

    const posts = await prisma.post.findMany({
      where,
      include: {
        author: {
          select: { id: true, name: true, username: true, image: true },
        },
        likes: {
          where: { userId: userId ?? "dummy" },
          select: { userId: true },
        },
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
          select: { likes: true, comments: true, shares: true, quotes: true },
        },
        repostedBy: {
          where: { userId: userId ?? "dummy" },
          select: { userId: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
    });

    let nextCursor: string | null = null;
    if (posts.length > limit) {
      const nextItem = posts.pop();
      nextCursor = nextItem?.id || null;
    }

    return { posts, nextCursor };
  },
  async getComments(postId: string) {
    return await prisma.comment.findMany({
      where: { postId, parentId: null },
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
  },
};
