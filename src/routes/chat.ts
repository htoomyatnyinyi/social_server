import { Elysia, t } from "elysia";
import prisma from "../lib/prisma";

export const chatRoutes = new Elysia({ prefix: "/chat" })
  .ws("/ws", {
    body: t.Object({
      message: t.String(),
      receiverId: t.String(),
      senderId: t.String(),
      chatId: t.String(),
    }),
    async message(ws, { message, receiverId, senderId, chatId }) {
      // Store message in database
      const savedMessage = await prisma.message.create({
        data: {
          content: message,
          senderId,
          receiverId,
          chatId,
        },
      });

      // Broadcast to all clients (in a real app, you'd filter by receiver)
      ws.publish(chatId, {
        ...savedMessage,
        type: "new_message",
      });
    },
    open(ws) {
      const chatId = ws.data.query.chatId;
      if (chatId) {
        ws.subscribe(chatId);
        console.log(`User subscribed to chat: ${chatId}`);
      }
    },
  })
  .get("/rooms", async ({ query }) => {
    const { userId } = query;
    if (!userId) return [];

    return await prisma.chat.findMany({
      where: {
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
      return await prisma.chat.create({
        data: {
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
  );
