import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import prisma from "../lib/prisma";

export const notificationRoutes = new Elysia({ prefix: "/notifications" })
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
  .get("/", async ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    const userId = user.id as string;

    return await prisma.notification.findMany({
      where: { recipientId: userId },
      include: {
        issuer: { select: { id: true, name: true, image: true } },
        post: { select: { id: true, content: true, image: true } },
        comment: { select: { id: true, content: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  })
  .post("/read-all", async ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    await prisma.notification.updateMany({
      where: { recipientId: user.id as string, read: false },
      data: { read: true },
    });

    return { message: "All notifications marked as read" };
  })
  .post("/:id/read", async ({ params: { id }, user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    await prisma.notification.update({
      where: { id, recipientId: user.id as string },
      data: { read: true },
    });

    return { message: "Notification marked as read" };
  });
