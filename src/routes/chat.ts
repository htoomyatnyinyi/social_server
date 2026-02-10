import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import prisma from "../lib/prisma";

export const chatRoutes = new Elysia({ prefix: "/chat" })
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
      chatId: t.String(),
      token: t.Optional(t.String()),
    }),
    body: t.Object({
      message: t.String(),
      chatId: t.String(),
      senderId: t.Optional(t.String()),
      receiverId: t.Optional(t.String()),
    }),
    async open(ws) {
      const { chatId, token } = ws.data.query;

      if (token) {
        try {
          const payload = await (ws.data as any).jwt.verify(token);
          if (payload) {
            (ws.data as any).userId = payload.id;
          }
        } catch (error) {
          console.error("JWT verification failed:", error);
        }
      }

      // Verify that the chat room exists
      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: { users: true },
      });

      if (!chat) {
        console.error(`Chat room not found: ${chatId}`);
        ws.close();
        return;
      }

      // Optional: Check if user belongs to the chat room
      const userId = (ws.data as any).userId;
      if (!chat.isPublic && userId) {
        const isParticipant = chat.users.some((u) => u.id === userId);
        if (!isParticipant) {
          console.error(
            `User ${userId} is not a participant of chat ${chatId}`,
          );
          ws.close();
          return;
        }
      }

      ws.subscribe(chatId);
      console.log(`Connection opened for chat: ${chatId}`);
    },
    async message(ws, body) {
      const { message, chatId, senderId, receiverId } = body;
      const finalSenderId = (ws.data as any).userId || senderId;

      if (!finalSenderId) {
        console.error("No senderId available for message");
        return;
      }

      try {
        const savedMessage = await prisma.message.create({
          data: {
            content: message,
            senderId: finalSenderId as string,
            receiverId: receiverId || null,
            chatId,
          },
          include: {
            sender: {
              select: { id: true, name: true, username: true, image: true },
            },
          },
        });

        const response = {
          type: "new_message",
          ...savedMessage,
        };

        // Broadcast to everyone in the room
        ws.publish(chatId, response);
        // Also send back to the sender
        ws.send(response);
      } catch (error) {
        console.error("Error saving/sending message:", error);
      }
    },
  })
  .get("/public", async () => {
    let publicChat = await prisma.chat.findFirst({
      where: { isPublic: true },
    });

    if (!publicChat) {
      publicChat = await prisma.chat.create({
        data: { isPublic: true },
      });
    }

    return publicChat;
  })
  .get("/rooms", async ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    const userId = user.id as string;

    return await prisma.chat.findMany({
      where: {
        isPublic: false,
        users: {
          some: { id: userId },
        },
      },
      include: {
        users: {
          select: { id: true, name: true, username: true, image: true },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          include: {
            sender: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  })
  .post(
    "/rooms",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { message: "Unauthorized" };
      }

      const { targetUserId } = body;
      const currentUserId = user.id as string;

      if (currentUserId === targetUserId) {
        set.status = 400;
        return { message: "Cannot create chat with yourself" };
      }

      // Check if they follow each other (mutual follow)
      const follow1 = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: targetUserId,
          },
        },
      });

      const follow2 = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: targetUserId,
            followingId: currentUserId,
          },
        },
      });

      if (!follow1 || !follow2) {
        set.status = 403;
        return {
          message:
            "You must follow each other mutually to start a private chat",
        };
      }

      // Find existing private chat between these two users
      const existing = await prisma.chat.findFirst({
        where: {
          isPublic: false,
          AND: [
            { users: { some: { id: currentUserId } } },
            { users: { some: { id: targetUserId } } },
          ],
        },
        include: {
          users: {
            select: { id: true, name: true, username: true, image: true },
          },
        },
      });

      if (existing) return existing;

      return await prisma.chat.create({
        data: {
          isPublic: false,
          users: {
            connect: [{ id: currentUserId }, { id: targetUserId }],
          },
        },
        include: {
          users: {
            select: { id: true, name: true, username: true, image: true },
          },
        },
      });
    },
    {
      body: t.Object({
        targetUserId: t.String(),
      }),
    },
  )
  .get("/messages/:chatId", async ({ params, user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    return await prisma.message.findMany({
      where: { chatId: params.chatId },
      orderBy: { createdAt: "asc" },
      include: {
        sender: {
          select: { id: true, name: true, username: true, image: true },
        },
      },
    });
  });
