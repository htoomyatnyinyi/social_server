import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import prisma from "../lib/prisma";
import { events } from "../lib/events";
import redis from "../lib/redis";

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
  .ws("/ws", {
    query: t.Object({
      token: t.String(),
    }),
    async open(ws) {
      const { token } = ws.data.query;
      try {
        const payload = await (ws.data as any).jwt.verify(token);
        if (payload && payload.id) {
          const userId = payload.id;
          ws.subscribe(`user:${userId}`);
          console.log(`Subscribed WS to topic: user:${userId}`);
        } else {
          ws.close();
        }
      } catch (err) {
        ws.close();
      }
    },
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
        issuer: {
          select: { id: true, name: true, username: true, image: true },
        },
        post: { select: { id: true, content: true, image: true } },
        comment: { select: { id: true, content: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  })
  .get("/unread-count", async ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    const cacheKey = `notif:unread:${user.id}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const count = await prisma.notification.count({
      where: {
        recipientId: user.id as string,
        read: false,
      },
    });

    await redis.setex(cacheKey, 15, JSON.stringify({ count }));
    return { count };
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

    // Invalidate unread count cache
    await redis.del(`notif:unread:${user.id}`);

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

    // Invalidate unread count cache
    await redis.del(`notif:unread:${user.id}`);

    return { message: "Notification marked as read" };
  });
