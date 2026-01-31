import { Elysia, t } from "elysia";
import prisma from "../lib/prisma";

export const chatRoutes = new Elysia({ prefix: "/chat" })
  .ws("/ws", {
    body: t.Object({
      message: t.String(),
      receiverId: t.Optional(t.String()),
      senderId: t.String(),
      chatId: t.String(),
    }),
    async message(ws, { message, receiverId, senderId, chatId }) {
      const savedMessage = await prisma.message.create({
        data: {
          content: message,
          senderId,
          receiverId: receiverId || "", // For public chat receiverId might be empty
          chatId,
        },
      });

      ws.publish(chatId, {
        ...savedMessage,
        type: "new_message",
      });
    },
    open(ws) {
      const chatId = ws.data.query.chatId;
      if (chatId) {
        ws.subscribe(chatId);
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

      // Check if private chat already exists between these users
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
  );
