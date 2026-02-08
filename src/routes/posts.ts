import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import prisma from "../lib/prisma";
import cloudinary from "../lib/cloudinary";
import { generateAIResponse, moderateContent } from "../lib/ai";

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
          select: { likes: true, comments: true, shares: true, reposts: true },
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
  // Grok
  .get("/feed", async ({ user }) => {
    if (!user) return []; // Or public only
    const following = await prisma.follow.findMany({
      // where: { followerId: user.id },
      where: { followerId: user.id },
      select: { followingId: true },
    });
    return prisma.post.findMany({
      where: {
        authorId: { in: following.map((f: any) => f.followingId) },
        isPublic: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
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
            _count: {
              select: {
                likes: true,
                bookmarks: {
                  where: { userId: user ? (user.id as string) : undefined },
                  select: { userId: true },
                },
                comments: true,
                shares: true,
                reposts: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return bookmarks.map((b: any) => b.post);
  })

  .post("/:id/bookmark", async ({ params: { id }, user }) => {
    if (!user) {
      return { message: "Unauthorized" };
    }

    const bookmark = await prisma.bookmark.create({
      data: {
        userId: user.id,
        postId: id,
      },
    });

    return bookmark;
  })

  .delete("/:id/bookmark", async ({ params: { id }, user }) => {
    if (!user) {
      return { message: "Unauthorized" };
    }

    const bookmark = await prisma.bookmark.delete({
      where: {
        userId_postId: {
          userId: user.id,
          postId: id,
        },
      },
    });

    return bookmark;
  })

  .get("/", async ({ query, user, set }) => {
    const { type } = query;
    let where: any = { isPublic: true };

    if (type === "private") {
      if (!user) {
        set.status = 401;
        return { message: "Unauthorized to view private posts" };
      }
      where = { isPublic: false, authorId: user.id };
    }

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
      take: 20, // New: Basic Pagination
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
  // //
  // .post(
  //   "/",
  //   async ({ body, user, set }) => {
  //     if (!user) {
  //       set.status = 401;
  //       return { message: "Unauthorized" };
  //     }

  //     const { content, image, isPublic } = body;
  //     // start modify
  //     const userId = user.id as string;

  //     // New: Moderate content
  //     if (content && (await moderateContent(content))) {
  //       set.status = 400;
  //       return { message: "Content violates guidelines" };
  //     }
  //     // end
  //     let imageUrl = null;

  //     if (image && image.startsWith("data:image")) {
  //       const uploadResponse = await cloudinary.uploader.upload(image, {
  //         folder: "social_app/posts",
  //       });
  //       imageUrl = uploadResponse.secure_url;
  //     } else if (image) {
  //       imageUrl = image;
  //     }

  //     const post = await prisma.post.create({
  //       data: {
  //         content,
  //         image: imageUrl,
  //         isPublic: isPublic ?? true,
  //         authorId: user.id as string,
  //       },
  //       include: {
  //         author: {
  //           select: { id: true, name: true, username: true, image: true },
  //         },
  //       },
  //     });

  //     // #$$$
  //     // gemini
  //     // Extract mentions
  //     const mentionRegex = /@(\w+)/g;
  //     const matches = content?.match(mentionRegex);
  //     if (matches) {
  //       const mentionedUsernames = [
  //         ...new Set(matches.map((match) => match.slice(1))),
  //       ];
  //       const mentionedUsers = await prisma.user.findMany({
  //         where: {
  //           username: { in: mentionedUsernames },
  //           NOT: { id: user.id as string },
  //         },
  //       });

  //       await Promise.all([
  //         ...mentionedUsers.map((mentionedUser: any) =>
  //           prisma.notification.create({
  //             data: {
  //               type: "MENTION",
  //               recipientId: mentionedUser.id,
  //               issuerId: user.id as string,
  //               postId: post.id,
  //             },
  //           }),
  //         ),
  //         ...mentionedUsers.map((mentionedUser: any) =>
  //           prisma.mention.create({
  //             data: {
  //               postId: post.id,
  //               userId: mentionedUser.id,
  //             },
  //           }),
  //         ),
  //       ]);
  //     }
  //     // Grok
  //     // In post("/") or comment endpoint, after prisma.create
  //     // const mentions = content.match(/@(\w+)/g) || [];
  //     // for (const mention of mentions) {
  //     //   const username = mention.slice(1);
  //     //   const mentionedUser = await prisma.user.findUnique({ where: { username } });
  //     //   if (mentionedUser && mentionedUser.id !== user.id) {
  //     //     await prisma.notification.create({
  //     //       data: {
  //     //         type: "MENTION",
  //     //         recipientId: mentionedUser.id,
  //     //         issuerId: user.id as string,
  //     //         postId: post.id, // or commentId
  //     //       },
  //     //     });
  //     //     // Optional: Create Mention record
  //     //     await prisma.mention.create({ data: { postId: post.id, userId: mentionedUser.id } });
  //     //   }
  //     // }
  //     // $$$

  //     return post;
  //   },
  //   {
  //     body: t.Object({
  //       content: t.Optional(t.String()),
  //       image: t.Optional(t.String()),
  //       isPublic: t.Optional(t.Boolean()),
  //     }),
  //   },
  // )
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

  // .post(
  //   "/:id/repost",
  //   async ({ params: { id }, body, user, set }) => {
  //     if (!user) {
  //       set.status = 401;
  //       return { message: "Unauthorized" };
  //     }

  //     const { content, image } = body;

  //     const originalPost = await prisma.post.findUnique({
  //       where: { id },
  //     });

  //     if (!originalPost) {
  //       set.status = 404;
  //       return { message: "Original post not found" };
  //     }

  //     let imageUrl = null;
  //     if (image && image.startsWith("data:image")) {
  //       const uploadResponse = await cloudinary.uploader.upload(image, {
  //         folder: "social_app/posts",
  //       });
  //       imageUrl = uploadResponse.secure_url;
  //     }

  //     const repost = await prisma.post.create({
  //       data: {
  //         content: content || undefined,
  //         image: imageUrl || undefined,
  //         isRepost: true, // It is still technically a repost/quote
  //         originalPostId: id,
  //         authorId: user.id as string,
  //         isPublic: true,
  //       },
  //       include: {
  //         author: {
  //           select: { id: true, name: true, username: true, image: true },
  //         },
  //         originalPost: {
  //           include: {
  //             author: {
  //               select: { id: true, name: true, username: true, image: true },
  //             },
  //           },
  //         },
  //       },
  //     });

  //     if (originalPost.authorId !== (user.id as string)) {
  //       await prisma.notification.create({
  //         data: {
  //           type: content ? "QUOTE" : "REPOST", // Differentiate for notification if needed, or just REPOST
  //           recipientId: originalPost.authorId,
  //           issuerId: user.id as string,
  //           postId: originalPost.id, // Notification links to original post
  //         },
  //       });
  //     }

  //     return repost;
  //   },
  //   {
  //     body: t.Object({
  //       content: t.Optional(t.String()),
  //       image: t.Optional(t.String()),
  //     }),
  //   },
  // )

  .post(
    "/:id/repost",
    async ({ params: { id }, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { message: "Unauthorized" };
      }

      const { content, image } = body;

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
          isRepost: true,
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
        // Offload notification to background
        (async () => {
          try {
            await prisma.notification.create({
              data: {
                type: content ? "QUOTE" : "REPOST",
                recipientId: originalPost.authorId,
                issuerId: user.id as string,
                postId: originalPost.id,
              },
            });
          } catch (error) {
            console.error("Background repost notification error:", error);
          }
        })();
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
  // .post(
  //   "/:id/comment",
  //   async ({ params: { id }, body, user, set }) => {
  //     if (!user) {
  //       set.status = 401;
  //       return { message: "Unauthorized" };
  //     }

  //     const { content, parentId } = body;

  //     const comment = await prisma.comment.create({
  //       data: {
  //         content,
  //         userId: user.id as string,
  //         postId: id,
  //         parentId: parentId || null,
  //       },
  //       include: {
  //         user: {
  //           select: { id: true, name: true, username: true, image: true },
  //         },
  //         post: { select: { authorId: true } },
  //         parent: { select: { userId: true } },
  //       },
  //     });

  //     const currentUserId = user.id as string;

  //     // Notify post author
  //     if (comment.post.authorId !== currentUserId) {
  //       await prisma.notification.create({
  //         data: {
  //           type: "COMMENT",
  //           recipientId: comment.post.authorId,
  //           issuerId: currentUserId,
  //           postId: id,
  //           commentId: comment.id,
  //         },
  //       });
  //     }

  //     // Notify parent comment author if it's a reply
  //     if (comment.parent && comment.parent.userId !== currentUserId) {
  //       await prisma.notification.create({
  //         data: {
  //           type: "REPLY",
  //           recipientId: comment.parent.userId,
  //           issuerId: currentUserId,
  //           postId: id,
  //           commentId: comment.id,
  //         },
  //       });
  //     }

  //     // Handle mentions in comments
  //     const mentionRegex = /@(\w+)/g;
  //     const matches = content?.match(mentionRegex);
  //     if (matches) {
  //       const mentionedUsernames = [
  //         ...new Set(matches.map((match) => match.slice(1))),
  //       ];
  //       const mentionedUsers = await prisma.user.findMany({
  //         where: {
  //           username: { in: mentionedUsernames },
  //           NOT: { id: currentUserId },
  //         },
  //       });

  //       await Promise.all([
  //         ...mentionedUsers.map((mentionedUser: any) =>
  //           prisma.notification.create({
  //             data: {
  //               type: "MENTION",
  //               recipientId: mentionedUser.id,
  //               issuerId: currentUserId,
  //               postId: id,
  //               commentId: comment.id,
  //             },
  //           }),
  //         ),
  //         ...mentionedUsers.map((mentionedUser: any) =>
  //           prisma.mention.create({
  //             data: {
  //               postId: id,
  //               commentId: comment.id,
  //               userId: mentionedUser.id,
  //             },
  //           }),
  //         ),
  //       ]);
  //     }

  //     return comment;
  //   },
  //   {
  //     body: t.Object({
  //       content: t.String(),
  //       parentId: t.Optional(t.String()),
  //     }),
  //   },
  // );

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
