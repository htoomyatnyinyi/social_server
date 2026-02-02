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
            senderId: finalSenderId,
            receiverId: receiverId || null,
            chatId,
          },
          include: {
            sender: {
              select: { id: true, name: true, image: true },
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
  .get("/rooms", async ({ query }) => {
    const { userId } = query;
    if (!userId) return [];

    return await prisma.chat.findMany({
      where: {
        isPublic: false,
        users: {
          some: { id: userId as string },
        },
      },
      include: {
        users: {
          select: { id: true, name: true, image: true },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });
  })
  .post(
    "/rooms",
    async ({ body }) => {
      const { userIds } = body;

      if (userIds.length === 2) {
        const existing = await prisma.chat.findFirst({
          where: {
            isPublic: false,
            AND: [
              { users: { some: { id: userIds[0] } } },
              { users: { some: { id: userIds[1] } } },
            ],
          },
        });
        if (existing) return existing;
      }

      return await prisma.chat.create({
        data: {
          isPublic: false,
          users: {
            connect: userIds.map((id: string) => ({ id })),
          },
        },
      });
    },
    {
      body: t.Object({
        userIds: t.Array(t.String()),
      }),
    },
  )
  .get("/messages/:chatId", async ({ params }) => {
    return await prisma.message.findMany({
      where: { chatId: params.chatId },
      orderBy: { createdAt: "asc" },
      include: {
        sender: {
          select: { id: true, name: true, image: true },
        },
      },
    });
  });
