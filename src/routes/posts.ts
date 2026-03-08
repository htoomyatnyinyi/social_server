import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import prisma from "../lib/prisma";
import { uploadToZipline } from "../lib/zipline";
import { generateAIResponse, moderateContent } from "../lib/ai";
import redis from "../lib/redis";
import { events } from "../lib/events";

// Background job to sync views every 1 minute
setInterval(async () => {
  const keys = await redis.keys("post:views:*");
  if (keys.length === 0) return;

  for (const key of keys) {
    const postId = key.split(":")[2];
    const views = await redis.get(key);
    if (views) {
      await prisma.post.update({
        where: { id: postId },
        data: { views: { increment: parseInt(views) } },
      });
      await redis.del(key);
    }
  }
  console.log(`Synced views for ${keys.length} posts`);
}, 60000);

const getPostInclude = (userId: string | null) => ({
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
  .get("/:id", async ({ params: { id }, user, set }) => {
    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, name: true, username: true, image: true },
        },
        likes: true,
        bookmarks: {
          where: { userId: user ? (user.id as string) : undefined },
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
          where: { userId: user ? (user.id as string) : undefined },
          select: { userId: true },
        },
      },
    });

    if (!post) {
      set.status = 404;
      return { message: "Post not found" };
    }

    if (!post.isPublic && (!user || post.authorId !== user.id)) {
      set.status = 403;
      return { message: "Forbidden" };
    }

    return post;
  })
  // Grok & Redis Optimized Feed
  .get("/feed", async ({ user, query }) => {
    if (!user) return [];

    // @ts-ignore
    const { cursor, limit = 20 } = query;
    const take = parseInt(limit as any) || 20;

    // User-specific include
    const postInclude = getPostInclude(user.id as string);

    // Cache following list
    const followingKey = `user:${user.id}:following`;
    let followingIds = await redis.smembers(followingKey);

    if (followingIds.length === 0) {
      const following = await prisma.follow.findMany({
        where: { followerId: user.id as string },
        select: { followingId: true },
      });
      followingIds = following.map((f: any) => f.followingId);
      if (followingIds.length > 0) {
        await redis.sadd(followingKey, ...followingIds);
        await redis.expire(followingKey, 300); // 5 minutes cache
      }
    }

    if (followingIds.length === 0) return { posts: [], nextCursor: null };

    const cursorDate = cursor
      ? new Date(parseInt(cursor as string))
      : new Date();

    // 1. Fetch Posts
    const posts = await prisma.post.findMany({
      where: {
        authorId: { in: followingIds },
        isPublic: true,
        createdAt: { lt: cursorDate },
      },
      orderBy: { createdAt: "desc" },
      take: take,
      include: postInclude,
    });

    // 2. Fetch Reposts
    const reposts = await prisma.repost.findMany({
      where: {
        userId: { in: followingIds },
        createdAt: { lt: cursorDate },
      },
      orderBy: { createdAt: "desc" },
      take: take,
      include: {
        user: {
          select: { id: true, name: true, username: true, image: true },
        },
        post: {
          include: postInclude,
        },
        // bookmarks: {
        //   where: { userId: user ? (user.id as string) : undefined },
        //   select: { userId: true },
        // },
      },
    });

    // 3. Merge & Sort
    const allItems = [...posts, ...reposts].sort(
      (a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    // 4. Slice
    const slicedItems = allItems.slice(0, take);

    // 5. Map to virtual posts
    const results = slicedItems.map((item: any) => {
      if (item.post) {
        // Is Repost
        return {
          ...item.post, // The original post content
          id: `repost_${item.id}`, // Virtual ID for the feed item
          createdAt: item.createdAt, // Repost time
          author: item.user, // The reposter
          isRepost: true,
          originalPost: item.post, // Keep original post ref for frontend compatibility if needed
          repostedByMe: item.post.repostedBy.length > 0,
        };
      }
      return {
        ...item,
        repostedByMe: item.repostedBy.length > 0,
      };
    });

    // 6. Next Cursor
    const lastItem = slicedItems[slicedItems.length - 1];
    const nextCursor =
      slicedItems.length === take
        ? lastItem.createdAt.getTime().toString()
        : null;

    return {
      posts: results,
      nextCursor,
    };
  })

  // generated
  .get("/:id/likes", async ({ params: { id }, user }) => {
    return await prisma.post.findUnique({
      where: { id },
      select: { likes: true },
    });
  })

  // end generated
  // end generated
  // ###
  .get("/bookmarks", async ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    const bookmarks = await prisma.bookmark.findMany({
      where: { userId: user.id as string },
      include: {
        post: {
          include: {
            author: {
              select: { id: true, name: true, username: true, image: true },
            },
            likes: true,
            bookmarks: {
              where: { userId: user ? (user.id as string) : undefined },
              select: { userId: true },
            },
            repostedBy: {
              where: { userId: user ? (user.id as string) : undefined },
              select: { userId: true },
            },
            _count: {
              select: {
                likes: true,
                comments: true,
                shares: true,
                quotes: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return bookmarks.map((b: any) => b.post);
  })

  .get("/", async ({ query, user, set }) => {
    // @ts-ignore
    const { type, cursor, limit = 20, sort = "newest", filter = "all" } = query;
    const take = parseInt(limit as any) || 20;

    let where: any = { isPublic: true };

    if (type === "private") {
      if (!user) {
        set.status = 401;
        return { message: "Unauthorized to view private posts" };
      }
      where = { isPublic: false, authorId: user.id };
    }

    // Exclude blocked and muted users
    if (user) {
      const userId = user.id as string;
      const [blockedRecords, mutedRecords] = await Promise.all([
        prisma.block.findMany({ where: { userId }, select: { blockId: true } }),
        prisma.mute.findMany({ where: { userId }, select: { mutedId: true } }),
      ]);
      const excludeIds = [
        ...new Set([
          ...blockedRecords.map((b: any) => b.blockId),
          ...mutedRecords.map((m: any) => m.mutedId),
        ]),
      ];
      if (excludeIds.length > 0) {
        where.authorId = { ...(where.authorId || {}), notIn: excludeIds };
      }
    }

    // Media filter
    if (filter === "media") {
      where.image = { not: null };
    }

    // For trending sort, fetch more recent posts and score in-memory
    if (sort === "trending" && type !== "private") {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // Last 48 hours
      where.createdAt = { gte: cutoff };

      const posts = await prisma.post.findMany({
        where,
        include: {
          author: {
            select: { id: true, name: true, username: true, image: true },
          },
          // @ts-ignore
          likes: {
            where: { userId: user ? (user.id as string) : "dummy_value" },
            select: { userId: true },
          },
          originalPost: {
            include: {
              author: {
                select: { id: true, name: true, username: true, image: true },
              },
            },
          },
          // @ts-ignore
          _count: {
            select: { likes: true, comments: true, shares: true, quotes: true },
          },
          repostedBy: {
            where: { userId: user ? (user.id as string) : undefined },
            select: { userId: true },
          },
          bookmarks: {
            where: { userId: user ? (user.id as string) : "dummy_value" },
            select: { userId: true },
          },
        },
        take: 100, // Fetch a larger pool for scoring
      });

      // Compute trending score
      const now = Date.now();
      const scored = posts.map((post: any) => {
        const ageHours =
          (now - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
        const engagement =
          post._count.likes * 2 +
          post._count.comments * 3 +
          post._count.shares * 4 +
          (post.views || 0) * 0.1;
        const score = engagement / Math.pow(ageHours + 2, 1.5);
        return { ...post, _trendingScore: score };
      });

      // Sort by score descending
      scored.sort((a: any, b: any) => b._trendingScore - a._trendingScore);

      // Paginate via cursor (use index-based for trending)
      const cursorIndex = cursor
        ? scored.findIndex((p: any) => p.id === cursor) + 1
        : 0;
      const sliced = scored.slice(cursorIndex, cursorIndex + take);

      const nextCursor =
        cursorIndex + take < scored.length
          ? sliced[sliced.length - 1]?.id || null
          : null;

      return { posts: sliced, nextCursor };
    }

    // Default: chronological sort
    const posts = await prisma.post.findMany({
      where,
      include: {
        author: {
          select: { id: true, name: true, username: true, image: true },
        },
        // @ts-ignore
        likes: {
          where: { userId: user ? (user.id as string) : "dummy_value" },
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
        // @ts-ignore
        _count: {
          select: { likes: true, comments: true, shares: true, quotes: true },
        },
        repostedBy: {
          where: { userId: user ? (user.id as string) : undefined },
          select: { userId: true },
        },
        bookmarks: {
          where: { userId: user ? (user.id as string) : "dummy_value" },
          select: { userId: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      cursor: cursor ? { id: cursor as string } : undefined,
      skip: cursor ? 1 : 0,
    });

    let nextCursor: string | null = null;
    if (posts.length > take) {
      const nextItem = posts.pop();
      nextCursor = nextItem?.id || null;
    }

    return {
      posts,
      nextCursor,
    };
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

  // #### may be do not need
  // gemini generate
  .get("/:id/mentions", async ({ params: { id } }) => {
    return await prisma.mention.findMany({
      where: { postId: id },
      include: {
        user: { select: { id: true, name: true, username: true, image: true } },
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
      const userId = user.id as string;

      // New: Moderate content
      if (content && (await moderateContent(content))) {
        set.status = 400;
        return { message: "Content violates guidelines" };
      }

      let imageUrl = null;

      if (image && image.startsWith("data:image")) {
        imageUrl = await uploadToZipline(image, "posts");
      } else if (image) {
        imageUrl = image;
      }

      const post = await prisma.post.create({
        data: {
          content,
          image: imageUrl,
          isPublic: isPublic ?? true,
          authorId: userId,
        },
        include: {
          author: {
            select: { id: true, name: true, username: true, image: true },
          },
        },
      });

      // Offload side effects to background
      (async () => {
        try {
          if (content) {
            const mentionMatches = content.match(/@(\w+)/g) || [];
            for (const match of mentionMatches) {
              const username = match.slice(1);
              const mentionedUser = await prisma.user.findUnique({
                where: { username },
              });

              if (mentionedUser && mentionedUser.id !== userId) {
                // Create mention record
                await prisma.mention.create({
                  data: {
                    userId: mentionedUser.id,
                    postId: post.id,
                  },
                });

                // Notify
                await prisma.notification.create({
                  data: {
                    type: "MENTION",
                    recipientId: mentionedUser.id,
                    issuerId: userId,
                    postId: post.id,
                  },
                });
                events.emit("notification", { recipientId: mentionedUser.id });

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
          }
        } catch (error) {
          console.error("Background post processing error:", error);
        }
      })();

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
      const userId = user.id as string;

      // New: Moderate content
      if (content && (await moderateContent(content))) {
        set.status = 400;
        return { message: "Content violates guidelines" };
      }

      const originalPost = await prisma.post.findUnique({
        where: { id },
      });

      if (!originalPost) {
        set.status = 404;
        return { message: "Original post not found" };
      }

      // IS QUOTE (New Post)
      if (content || image) {
        let imageUrl = null;
        if (image && image.startsWith("data:image")) {
          imageUrl = await uploadToZipline(image, "posts");
        }

        const quote = await prisma.post.create({
          data: {
            content: content || undefined,
            image: imageUrl || undefined,
            originalPostId: id,
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

        // Increment reposts count on original post
        await prisma.post.update({
          where: { id },
          data: { repostsCount: { increment: 1 } },
        });

        if (originalPost.authorId !== userId) {
          (async () => {
            try {
              await prisma.notification.create({
                data: {
                  type: "QUOTE",
                  recipientId: originalPost.authorId,
                  issuerId: userId,
                  postId: originalPost.id,
                },
              });
              events.emit("notification", {
                recipientId: originalPost.authorId,
              });
            } catch (error) {
              console.error("Background quote notification error:", error);
            }
          })();
        }

        return { ...quote, isQuote: true };
      }

      // IS PLAIN REPOST (Repost Record)
      else {
        // Check if already reposted
        const existingRepost = await prisma.repost.findUnique({
          where: {
            userId_postId: {
              userId,
              postId: id,
            },
          },
        });

        if (existingRepost) {
          set.status = 400;
          return { message: "Already reposted" };
        }

        const repost = await prisma.repost.create({
          data: {
            userId,
            postId: id,
          },
        });

        // Increment reposts count
        await prisma.post.update({
          where: { id },
          data: { repostsCount: { increment: 1 } },
        });

        if (originalPost.authorId !== userId) {
          (async () => {
            try {
              await prisma.notification.create({
                data: {
                  type: "REPOST",
                  recipientId: originalPost.authorId,
                  issuerId: userId,
                  postId: originalPost.id,
                },
              });
              events.emit("notification", {
                recipientId: originalPost.authorId,
              });
            } catch (error) {
              console.error("Background repost notification error:", error);
            }
          })();
        }

        return { ...repost, isQuote: false };
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

    const userId = user.id as string;

    const existingRepost = await prisma.repost.findUnique({
      where: {
        userId_postId: {
          userId,
          postId: id,
        },
      },
    });

    if (!existingRepost) {
      set.status = 404;
      return { message: "Repost not found" };
    }

    await prisma.repost.delete({
      where: {
        userId_postId: {
          userId,
          postId: id,
        },
      },
    });

    // Decrement reposts count
    await prisma.post.update({
      where: { id },
      data: { repostsCount: { decrement: 1 } },
    });

    return { message: "Repost removed" };
  })

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
      // events.emit('noti')
      events.emit("notification", { recipientId: post.authorId });
    }

    return { message: "Liked" };
  })
  .post("/:id/bookmark", async ({ params: { id }, user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    const userId = user.id as string;

    const existingBookmark = await prisma.bookmark.findUnique({
      where: {
        userId_postId: {
          userId,
          postId: id,
        },
      },
    });

    if (existingBookmark) {
      await prisma.bookmark.delete({
        where: { id: existingBookmark.id },
      });
      return { message: "Bookmark removed", bookmarked: false };
    }

    await prisma.bookmark.create({
      data: {
        userId,
        postId: id,
      },
    });

    return { message: "Post bookmarked", bookmarked: true };
  })
  .post("/:id/view", async ({ params: { id }, set }) => {
    // Increment view count in Redis
    try {
      await redis.incr(`post:views:${id}`);
      return { message: "View count incremented" };
    } catch (error) {
      // Fallback or ignore
      console.error("Redis view incr error:", error);
      return { message: "View count error" };
    }
  })
  .post("/:id/share", async ({ params: { id }, user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    try {
      await prisma.share.create({
        data: {
          postId: id,
          userId: user.id as string,
        },
      });
      return { message: "Post shared" };
    } catch (error) {
      set.status = 404;
      return { message: "Post not found" };
    }
  })
  .post("/:id/report", async ({ params: { id }, user, body, set }) => {
    if (!user || typeof user.id !== "string") {
      set.status = 401;
      return { message: "Unauthorized" };
    }
    const { reason } = body as { reason: string };
    const validReasons = ["SPAM", "HATE_SPEECH", "HARASSMENT", "OTHER"];
    if (!reason || !validReasons.includes(reason)) {
      set.status = 400;
      return {
        message: `Reason is required and must be one of: ${validReasons.join(", ")}`,
      };
    }
    try {
      await prisma.report.create({
        data: {
          postId: id,
          userId: user.id,
          reason: reason as any,
        },
      });
      return { message: "Post reported" };
    } catch (error) {
      set.status = 404;
      return { message: "Post not found" };
    }
  })
  .post("/:id/block", async ({ params: { id }, user, body, set }) => {
    if (!user || typeof user.id !== "string") {
      set.status = 401;
      return { message: "Unauthorized" };
    }
    const { blockId } = body as { blockId: string };
    if (!blockId || typeof blockId !== "string") {
      set.status = 400;
      return { message: "blockId (user to block) is required" };
    }
    try {
      await prisma.block.create({
        data: {
          userId: user.id,
          blockId,
        },
      });
      return { message: "User blocked" };
    } catch (error) {
      set.status = 404;
      return { message: "User not found or already blocked" };
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

    console.log(post, id, user, "at backend check");

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
      const userId = user.id as string;

      // New: Moderate content
      if (await moderateContent(content)) {
        set.status = 400;
        return { message: "Content violates guidelines" };
      }

      // Restrict replies to only one level deep
      if (parentId) {
        const parentComment = await prisma.comment.findUnique({
          where: { id: parentId },
          select: { parentId: true },
        });
        if (!parentComment) {
          set.status = 404;
          return { message: "Parent comment not found" };
        }
        if (parentComment.parentId) {
          set.status = 400;
          return {
            message:
              "Cannot reply to a reply. Only one level of replies allowed.",
          };
        }
      }

      const comment = await prisma.comment.create({
        data: {
          content,
          userId: userId,
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

      const currentUserId = userId;

      // Offload side effects to background
      (async () => {
        try {
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
            events.emit("notification", { recipientId: comment.post.authorId });
          }

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
            events.emit("notification", { recipientId: comment.parent.userId });
          }

          // Parse mentions in comment
          const mentionMatches = content.match(/@(\w+)/g) || [];
          for (const match of mentionMatches) {
            const username = match.slice(1);
            const mentionedUser = await prisma.user.findUnique({
              where: { username },
            });

            if (mentionedUser && mentionedUser.id !== userId) {
              // Create mention record
              await prisma.mention.create({
                data: {
                  userId: mentionedUser.id,
                  commentId: comment.id,
                },
              });

              // Notify
              await prisma.notification.create({
                data: {
                  type: "MENTION",
                  recipientId: mentionedUser.id,
                  issuerId: userId,
                  postId: id,
                  commentId: comment.id,
                },
              });
              events.emit("notification", { recipientId: mentionedUser.id });

              // Special: @grok
              if (username === "grok") {
                const question = content.replace(/@grok\s*/i, "").trim();
                if (question) {
                  const postContent = await prisma.post.findUnique({
                    where: { id: id },
                    select: { content: true },
                  });
                  const prompt = `Answer this question about the post: "${question}". Post content: "${postContent?.content || ""}"`;
                  const aiResponse = await generateAIResponse(prompt);

                  const botUser = await prisma.user.findUnique({
                    where: { username: "grok" },
                  });
                  if (botUser) {
                    await prisma.comment.create({
                      data: {
                        content: aiResponse,
                        userId: botUser.id,
                        postId: id,
                        parentId: comment.id, // Reply to the mentioning comment
                      },
                    });
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error("Background comment processing error:", error);
        }
      })();

      return comment;
    },
    {
      body: t.Object({
        content: t.String(),
        parentId: t.Optional(t.String()),
      }),
    },
  );
