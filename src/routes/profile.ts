import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import prisma from "../lib/prisma";
import cloudinary from "../lib/cloudinary";

export const profileRoutes = new Elysia({ prefix: "/profile" })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
      // schema: t.Object({
      //   id: t.String(),
      //   username: t.String(),
      //   email: t.String(),
      // }),
    }),
  )
  .derive(async ({ jwt, headers }) => {
    const auth = headers["authorization"];
    if (!auth || !auth.startsWith("Bearer ")) return { user: null };

    const token = auth.split(" ")[1];
    const user = await jwt.verify(token);

    return { user };
  })
  .get("/suggestions", async ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    const userId = user.id as string;

    // Get users I already follow
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });

    const followingIds = following.map((f: any) => f.followingId);
    followingIds.push(userId); // Exclude self

    // Find users NOT in followingIds
    const suggestions = await prisma.user.findMany({
      where: {
        id: { notIn: followingIds },
      },
      take: 10,
      select: {
        id: true,
        name: true,
        username: true,
        image: true,
        bio: true,
      },
      orderBy: { createdAt: "desc" }, // Simple strategy: newest users
    });

    return suggestions;
  })
  .get("/:id", async ({ params: { id }, user }) => {
    const profile = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        image: true,
        bio: true,
        _count: {
          select: {
            followers: true,
            following: true,
            posts: true,
          },
        },
      },
    });

    if (!profile) return { message: "Profile not found" };

    let isFollowing = false;
    if (user) {
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: user.id as string,
            followingId: id,
          },
        },
      });
      isFollowing = !!follow;
    }

    return { ...profile, isFollowing };
  })
  .post(
    "/update",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { message: "Unauthorized" };
      }

      const { name, bio, image, username } = body;
      let imageUrl = image;

      if (username) {
        const existingUser = await prisma.user.findFirst({
          where: {
            username,
            NOT: { id: user.id as string },
          },
        });

        if (existingUser) {
          set.status = 400;
          return { message: "Username already taken" };
        }
      }

      if (image && image.startsWith("data:image")) {
        const uploadResponse = await cloudinary.uploader.upload(image, {
          folder: "social_app/profiles",
        });
        imageUrl = uploadResponse.secure_url;
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id as string },
        data: {
          name,
          bio,
          username,
          image: imageUrl,
        },
      });

      return updatedUser;
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        bio: t.Optional(t.String()),
        image: t.Optional(t.String()),
        username: t.Optional(t.String()),
      }),
    },
  )
  // ### block user
  .post("/:id/block", async ({ params: { id }, user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    try {
      await prisma.block.create({
        data: {
          blockId: id,
          userId: user.id as string,
        },
      });
      return { message: "User blocked" };
    } catch (error) {
      set.status = 404;
      return { message: "User not found" };
    }
  })

  // ### end block user
  .post("/:id/follow", async ({ params: { id }, user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    const followerId = user.id as string;
    const followingId = id;

    if (followerId === followingId) {
      set.status = 400;
      return { message: "You cannot follow yourself" };
    }

    console.log(`User ${followerId} toggling follow on ${followingId}`);

    // Safety check just in case
    const followingExists = await prisma.user.findUnique({
      where: { id: followingId },
    });
    if (!followingExists) {
      set.status = 404;
      return { message: "User not found" };
    }

    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
    });

    if (existingFollow) {
      await prisma.follow.delete({
        where: { id: existingFollow.id },
      });
      return { message: "Unfollowed", isFollowing: false };
    }

    await prisma.follow.create({
      data: {
        followerId,
        followingId,
      },
    });

    try {
      await prisma.notification.create({
        data: {
          type: "FOLLOW",
          recipientId: followingId,
          issuerId: followerId,
        },
      });
    } catch (err) {
      console.error("Failed to create follow notification", err);
    }

    return { message: "Followed", isFollowing: true };
  })
  .get("/:id/followers", async ({ params: { id } }) => {
    const followers = await prisma.follow.findMany({
      where: { followingId: id },
      include: {
        follower: {
          select: {
            id: true,
            name: true,
            username: true,
            image: true,
            bio: true,
          },
        },
      },
    });
    // return followers.map((f) => f.followerId);
    return followers.map((f: any) => f.follower);
  })
  .get("/:id/following", async ({ params: { id } }) => {
    const following = await prisma.follow.findMany({
      where: { followerId: id },
      include: {
        following: {
          select: {
            id: true,
            name: true,
            username: true,
            image: true,
            bio: true,
          },
        },
      },
    });
    // return following.map((f) => f.followingId);
    return following.map((f: any) => f.following);
  })
  .get("/:id/posts", async ({ params: { id }, user }) => {
    // 1. Fetch Posts authored by user
    const posts = await prisma.post.findMany({
      where: {
        authorId: id,
        isPublic: !user || user.id !== id ? true : undefined,
      },
      include: {
        author: {
          select: { id: true, name: true, username: true, image: true },
        },
        likes: {
          where: { userId: user ? (user.id as string) : "dummy" },
          select: { userId: true },
        },
        repostedBy: {
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
          select: { likes: true, comments: true, quotes: true, shares: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 2. Fetch Reposts made by user
    // Only show reposts if viewing own profile or public logic?
    // Usually reposts on profile are visible to everyone.
    const reposts = await prisma.repost.findMany({
      where: { userId: id },
      include: {
        user: {
          select: { id: true, name: true, username: true, image: true },
        },
        post: {
          include: {
            author: {
              select: { id: true, name: true, username: true, image: true },
            },
            likes: {
              where: { userId: user ? (user.id as string) : "dummy" },
              select: { userId: true },
            },
            repostedBy: {
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
              select: {
                likes: true,
                comments: true,
                quotes: true,
                shares: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 3. Merge & Sort
    const allItems = [...posts, ...reposts].sort(
      (a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    // 4. Map to virtual posts
    return allItems.map((item: any) => {
      if (item.post) {
        // Is Repost
        return {
          ...item.post,
          id: `repost_${item.id}`,
          createdAt: item.createdAt,
          author: item.user, // The reposter (profile owner)
          isRepost: true, // It is a repost
          originalPost: item.post, // The content
          repostedByMe: item.post.repostedBy.length > 0,
        };
      }
      return {
        ...item,
        repostedByMe: item.repostedBy.length > 0,
      };
    });
  })
  .get("/:id/likes", async ({ params: { id }, user }) => {
    const isOwner = user && user.id === id;

    const likes = await prisma.like.findMany({
      where: {
        userId: id,
        post: isOwner ? {} : { isPublic: true },
      },
      include: {
        post: {
          include: {
            author: {
              select: { id: true, name: true, username: true, image: true },
            },
            likes: {
              where: { userId: user ? (user.id as string) : "dummy" },
              select: { userId: true },
            },
            repostedBy: {
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
              select: {
                likes: true,
                comments: true,
                quotes: true,
                shares: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return likes.map((l: any) => ({
      ...l.post,
      repostedByMe: l.post.repostedBy.length > 0,
    }));
  });
