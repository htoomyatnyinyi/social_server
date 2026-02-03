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
      return { message: "Unfollowed" };
    }

    await prisma.follow.create({
      data: {
        followerId,
        followingId,
      },
    });

    await prisma.notification.create({
      data: {
        type: "FOLLOW",
        recipientId: followingId,
        issuerId: followerId,
      },
    });

    return { message: "Followed" };
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
    return followers.map((f) => f.followerId);
    // return followers.map((f) => f.follower);
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
    return following.map((f) => f.followingId);
    // return following.map((f) => f.following);
  })
  .get("/:id/posts", async ({ params: { id } }) => {
    return await prisma.post.findMany({
      where: { authorId: id },
      include: {
        author: {
          select: { id: true, name: true, username: true, image: true },
        },
        likes: true,
        _count: {
          select: { likes: true, comments: true, reposts: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  })
  .get("/:id/likes", async ({ params: { id } }) => {
    const likes = await prisma.like.findMany({
      where: { userId: id },
      include: {
        post: {
          include: {
            author: {
              select: { id: true, name: true, username: true, image: true },
            },
            likes: true,
            _count: {
              select: { likes: true, comments: true, reposts: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return likes.map((l) => l.postId);
    // return likes.map((l) => l.post);
  });
