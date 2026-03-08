import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import prisma from "../lib/prisma";
import { events } from "../lib/events";

export const notificationRoutes = new Elysia({ prefix: "/notifications" })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
    }),
  )
  .ws("/ws", {
    query: t.Object({
      token: t.String(),
    }),
    async open(ws) {
      const { token } = ws.data.query;
      console.log(`📡 Notification WS: Attempting connection with token (len: ${token?.length})`);
      
      try {
        const context = ws.data as any;
        if (!context.jwt) {
          console.error("❌ Notification WS: jwt plugin context missing!");
          ws.close();
          return;
        }

        const payload = await context.jwt.verify(token);
        if (payload && payload.id) {
          const userId = payload.id;
          ws.subscribe(`user:${userId}`);
          console.log(`✅ Notification WS: Subscribed user ${userId} to topic: user:${userId}`);
        } else {
          console.error("❌ Notification WS: Invalid token payload — closing");
          ws.close();
        }
      } catch (err) {
        console.error("❌ Notification WS: Verification error", err);
        ws.close();
      }
    },
    close(ws) {
      console.log("🔌 Notification WS: Connection closed");
    },
  })
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

    const count = await prisma.notification.count({
      where: {
        recipientId: user.id as string,
        read: false,
      },
    });

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

    return { message: "All notifications marked as read" };
  })
  .post("/:id/read", async ({ params: { id }, user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    const userId = user.id as string;

    // First find the notification to know its grouped attributes
    const notif = await prisma.notification.findUnique({
      where: { id, recipientId: userId },
    });

    if (!notif) {
      set.status = 404;
      return { message: "Notification not found" };
    }

    // Instead of just marking ONE read, mark ALL notifications that match this "Group" as read
    // This supports the collapsed UI logic: same type, same issuer, same target entity
    await prisma.notification.updateMany({
      where: {
        recipientId: userId,
        type: notif.type,
        issuerId: notif.issuerId,
        postId: notif.postId,
        commentId: notif.commentId,
        read: false, // Only update unread
      },
      data: { read: true },
    });

    return { message: "Notification group marked as read" };
  });
