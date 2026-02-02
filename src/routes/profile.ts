import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import prisma from "../lib/prisma";
import cloudinary from "../lib/cloudinary";

export const profileRoutes = new Elysia({ prefix: "/profile" })
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
  .get("/:id", async ({ params: { id }, user }) => {
    const profile = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
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

      const { name, bio, image } = body;
      let imageUrl = image;

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

    return { message: "Followed" };
  })
  .get("/:id/followers", async ({ params: { id } }) => {
    const followers = await prisma.follow.findMany({
      where: { followingId: id },
      include: {
        follower: {
          select: { id: true, name: true, image: true, bio: true },
        },
      },
    });
    return followers.map((f) => f.follower);
  })
  .get("/:id/following", async ({ params: { id } }) => {
    const following = await prisma.follow.findMany({
      where: { followerId: id },
      include: {
        following: {
          select: { id: true, name: true, image: true, bio: true },
        },
      },
    });
    return following.map((f) => f.following);
  });
