import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import prisma from "../lib/prisma";
import { events } from "../lib/events";
import { updateUserStatus } from "../lib/status";

// -----------------------------------------------------------------------------
// GLOBAL STATE
// -----------------------------------------------------------------------------
// We define this OUTSIDE the route handler so it persists across all requests.
// Map<ChatId, Set<UserId>>
const activeChatParticipants = new Map<string, Set<string>>();

export const chatRoutes = new Elysia({ prefix: "/chat" })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
    })
  )
  .derive(async ({ jwt, headers }) => {
    const auth = headers["authorization"];
    if (!auth || !auth.startsWith("Bearer ")) return { user: null };

    const token = auth.split(" ")[1];
    const user = await jwt.verify(token);

    return {
      user,
    };
  })

  // ---------------------------------------------------------------------------
  // WEBSOCKET HANDLER
  // ---------------------------------------------------------------------------
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

      // 1. Authenticate and attach User ID to the WebSocket instance
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

      const userId = (ws.data as any).userId;

      // 2. Verify Chat Room Exists
      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: { users: true },
      });

      if (!chat) {
        console.error(`Chat room not found: ${chatId}`);
        ws.close();
        return;
      }

      // 3. Verify Membership (if private)
      if (!chat.isPublic && userId) {
        const isParticipant = chat.users.some((u: any) => u.id === userId);
        if (!isParticipant) {
          console.error(
            `User ${userId} is not a participant of chat ${chatId}`
          );
          ws.close();
          return;
        }
      }

      // 4. Subscribe to Channels
      ws.subscribe(chatId);
      console.log(`Connection opened for chat: ${chatId}`);

      // 5. Update Global State
      if (userId) {
        updateUserStatus(userId);
        ws.subscribe(`presence-${userId}`);

        if (!activeChatParticipants.has(chatId)) {
          activeChatParticipants.set(chatId, new Set());
        }
        activeChatParticipants.get(chatId)?.add(userId);
      }
    },

    close(ws) {
      const userId = (ws.data as any).userId;
      const { chatId } = ws.data.query;

      if (userId) {
        updateUserStatus(userId);

        // Remove user from active participants list
        const participants = activeChatParticipants.get(chatId);
        participants?.delete(userId);
        
        // Cleanup empty sets to prevent memory leaks
        if (participants?.size === 0) {
          activeChatParticipants.delete(chatId);
        }
      }
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

        // Broadcast to everyone in the room (including sender via WS subscription)
        ws.publish(chatId, response);
        // Explicitly send back to the socket that sent it (optional, but good for confirmation)
        ws.send(response);

        // Notify recipient logic
        const recipientId = savedMessage.receiverId;
        if (recipientId) {
          // Check global map
          const isRecipientActive = activeChatParticipants
            .get(chatId)
            ?.has(recipientId);

          if (!isRecipientActive) {
            try {
              await prisma.notification.create({
                data: {
                  type: "MESSAGE",
                  recipientId,
                  issuerId: finalSenderId as string,
                },
              });
              events.emit("notification", { recipientId });
            } catch (e) {
              console.error("Failed to create message notification", e);
            }
          }
        }
      } catch (error) {
        console.error("Error saving/sending message:", error);
      }
    },
  })

  // ---------------------------------------------------------------------------
  // HTTP REST ROUTES
  // ---------------------------------------------------------------------------

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

      // Check mutual follow
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

      // Find existing private chat
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
    }
  )

  .post(
    "/message",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { message: "Unauthorized" };
      }

      const { chatId, content, receiverId } = body;
      const senderId = user.id as string;

      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: { users: true },
      });

      if (!chat) {
        set.status = 404;
        return { message: "Chat not found" };
      }

      if (!chat.isPublic) {
        const isParticipant = chat.users.some((u: any) => u.id === senderId);
        if (!isParticipant) {
          set.status = 403;
          return { message: "Not a participant" };
        }
      }

      try {
        const savedMessage = await prisma.message.create({
          data: {
            content,
            senderId,
            receiverId: receiverId || null,
            chatId,
          },
          include: {
            sender: {
              select: { id: true, name: true, username: true, image: true },
            },
          },
        });

        // Emit event so the WS server (or other parts of the app) can broadcast this
        events.emit("new_message", { chatId, message: savedMessage });

        // Notify recipient if NOT active in the chat
        // We use the same Logic as the WS handler
        const recipientUserId =
          receiverId || chat.users.find((u: any) => u.id !== senderId)?.id;

        if (recipientUserId && recipientUserId !== senderId) {
          // Check GLOBAL map
          const isRecipientActive = activeChatParticipants
            .get(chatId)
            ?.has(recipientUserId);

          if (!isRecipientActive) {
            try {
              await prisma.notification.create({
                data: {
                  type: "MESSAGE",
                  recipientId: recipientUserId,
                  issuerId: senderId,
                },
              });
              events.emit("notification", { recipientId: recipientUserId });
            } catch (e) {
              console.error("Failed to create message notification", e);
            }
          }
        }

        return savedMessage;
      } catch (error) {
        console.error("Error saving message via POST:", error);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        chatId: t.String(),
        content: t.String(),
        receiverId: t.Optional(t.String()),
      }),
    }
  )

  .get(
    "/messages/:chatId",
    async ({ params, query, user, set }) => {
      if (!user) {
        set.status = 401;
        return { message: "Unauthorized" };
      }

      const { after } = query;
      const where: any = { chatId: params.chatId };

      if (after) {
        where.createdAt = {
          gt: new Date(Number(after)),
        };
      }

      return await prisma.message.findMany({
        where,
        orderBy: { createdAt: "asc" },
        include: {
          sender: {
            select: { id: true, name: true, username: true, image: true },
          },
        },
      });
    },
    {
      query: t.Object({
        after: t.Optional(t.String()),
      }),
    }
  );
// import { Elysia, t } from "elysia";
// import { jwt } from "@elysiajs/jwt";
// import prisma from "../lib/prisma";
// import { events } from "../lib/events";
// import { updateUserStatus } from "../lib/status";

// export const chatRoutes = new Elysia({ prefix: "/chat" })
//   .use(
//     jwt({
//       name: "jwt",
//       secret: process.env.JWT_SECRET!,
//     }),
//   )
//   .derive(async ({ jwt, headers }) => {
//     const auth = headers["authorization"];
//     if (!auth || !auth.startsWith("Bearer ")) return { user: null };

//     const token = auth.split(" ")[1];
//     const user = await jwt.verify(token);
//     // Track active participants in each chat: Map<chatId, Set<userId>>
//     // This is in-memory and per-instance. For scaling, use Redis.
//     const activeChatParticipants = new Map<string, Set<string>>();
//     return {
//         activeChatParticipants,
//         user
//     };
//   })
//   .ws("/ws", {
//     query: t.Object({
//       chatId: t.String(),
//       token: t.Optional(t.String()),
//     }),
//     body: t.Object({
//       message: t.String(),
//       chatId: t.String(),
//       senderId: t.Optional(t.String()),
//       receiverId: t.Optional(t.String()),
//     }),
//     async open(ws) {
//       const { chatId, token } = ws.data.query;

//       if (token) {
//         try {
//           const payload = await (ws.data as any).jwt.verify(token);
//           if (payload) {
//             (ws.data as any).userId = payload.id;
//           }
//         } catch (error) {
//           console.error("JWT verification failed:", error);
//         }
//       }

//       // Verify that the chat room exists
//       const chat = await prisma.chat.findUnique({
//         where: { id: chatId },
//         include: { users: true },
//       });

//       if (!chat) {
//         console.error(`Chat room not found: ${chatId}`);
//         ws.close();
//         return;
//       }

//       // Optional: Check if user belongs to the chat room
//       const userId = (ws.data as any).userId;
//       if (!chat.isPublic && userId) {
//         const isParticipant = chat.users.some((u:any) => u.id === userId);
//         if (!isParticipant) {
//           console.error(
//             `User ${userId} is not a participant of chat ${chatId}`,
//           );
//           ws.close();
//           return;
//         }
//       }

//       ws.subscribe(chatId);
//       console.log(`Connection opened for chat: ${chatId}`);

//       // Update user status and active participants
//       if (userId) {
//         updateUserStatus(userId);
//         ws.subscribe(`presence-${userId}`);
        
//         // Add to active participants
//         if (!activeChatParticipants.has(chatId)) {
//             activeChatParticipants.set(chatId, new Set());
//         }
//         activeChatParticipants.get(chatId)?.add(userId);
//       }
//     },
//     close(ws) {
//         const userId = (ws.data as any).userId;
//         const { chatId } = ws.data.query;
        
//         if (userId) {
//             updateUserStatus(userId);
//             // Remove from active participants
//             const participants = activeChatParticipants.get(chatId);
//             participants?.delete(userId);
//             if (participants?.size === 0) {
//                 activeChatParticipants.delete(chatId);
//             }
//         }
//     },
//     async message(ws, body) {
//       const { message, chatId, senderId, receiverId } = body;
//       const finalSenderId = (ws.data as any).userId || senderId;

//       if (!finalSenderId) {
//         console.error("No senderId available for message");
//         return;
//       }

//       try {
//         const savedMessage = await prisma.message.create({
//           data: {
//             content: message,
//             senderId: finalSenderId as string,
//             receiverId: receiverId || null,
//             chatId,
//           },
//           include: {
//             sender: {
//               select: { id: true, name: true, username: true, image: true },
//             },
//           },
//         });

//         const response = {
//           type: "new_message",
//           ...savedMessage,
//         };

//         // Broadcast to everyone in the room
//         ws.publish(chatId, response);
//         // Also send back to the sender
//         ws.send(response);

//         // Notify recipient ONLY if they are NOT active in the chat
//         const recipientId = savedMessage.receiverId;
//         if (recipientId) {
//             const isRecipientActive = activeChatParticipants.get(chatId)?.has(recipientId);
            
//             if (!isRecipientActive) {
//                 try {
//                     await prisma.notification.create({
//                     data: {
//                         type: "MESSAGE",
//                         recipientId,
//                         issuerId: finalSenderId as string,
//                     },
//                     });
//                     events.emit("notification", { recipientId });
//                 } catch (e) {
//                     console.error("Failed to create message notification", e);
//                 }
//             } else {
//                 console.log(`Skipping notification for active user ${recipientId} in chat ${chatId}`);
//             }
//         }
//       } catch (error) {
//         console.error("Error saving/sending message:", error);
//       }
//     },
//   })
//   .get("/public", async () => {
//     let publicChat = await prisma.chat.findFirst({
//       where: { isPublic: true },
//     });

//     if (!publicChat) {
//       publicChat = await prisma.chat.create({
//         data: { isPublic: true },
//       });
//     }

//     return publicChat;
//   })
//   .get("/rooms", async ({ user, set }) => {
//     if (!user) {
//       set.status = 401;
//       return { message: "Unauthorized" };
//     }

//     const userId = user.id as string;

//     return await prisma.chat.findMany({
//       where: {
//         isPublic: false,
//         users: {
//           some: { id: userId },
//         },
//       },
//       include: {
//         users: {
//           select: { id: true, name: true, username: true, image: true },
//         },
//         messages: {
//           take: 1,
//           orderBy: { createdAt: "desc" },
//           include: {
//             sender: { select: { id: true, name: true } },
//           },
//         },
//       },
//       orderBy: { updatedAt: "desc" },
//     });
//   })
//   .post(
//     "/rooms",
//     async ({ body, user, set }) => {
//       if (!user) {
//         set.status = 401;
//         return { message: "Unauthorized" };
//       }

//       const { targetUserId } = body;
//       const currentUserId = user.id as string;

//       if (currentUserId === targetUserId) {
//         set.status = 400;
//         return { message: "Cannot create chat with yourself" };
//       }

//       // Check if they follow each other (mutual follow)
//       const follow1 = await prisma.follow.findUnique({
//         where: {
//           followerId_followingId: {
//             followerId: currentUserId,
//             followingId: targetUserId,
//           },
//         },
//       });

//       const follow2 = await prisma.follow.findUnique({
//         where: {
//           followerId_followingId: {
//             followerId: targetUserId,
//             followingId: currentUserId,
//           },
//         },
//       });

//       if (!follow1 || !follow2) {
//         set.status = 403;
//         return {
//           message:
//             "You must follow each other mutually to start a private chat",
//         };
//       }

//       // Find existing private chat between these two users
//       const existing = await prisma.chat.findFirst({
//         where: {
//           isPublic: false,
//           AND: [
//             { users: { some: { id: currentUserId } } },
//             { users: { some: { id: targetUserId } } },
//           ],
//         },
//         include: {
//           users: {
//             select: { id: true, name: true, username: true, image: true },
//           },
//         },
//       });

//       if (existing) return existing;

//       return await prisma.chat.create({
//         data: {
//           isPublic: false,
//           users: {
//             connect: [{ id: currentUserId }, { id: targetUserId }],
//           },
//         },
//         include: {
//           users: {
//             select: { id: true, name: true, username: true, image: true },
//           },
//         },
//       });
//     },
//     {
//       body: t.Object({
//         targetUserId: t.String(),
//       }),
//     },
//   )
//   .post(
//     "/message",
//     async ({ body, user, set }) => {
//       if (!user) {
//         set.status = 401;
//         return { message: "Unauthorized" };
//       }

//       const { chatId, content, receiverId } = body;
//       const senderId = user.id as string;

//       // Check if chat exists and user is a participant
//       const chat = await prisma.chat.findUnique({
//         where: { id: chatId },
//         include: { users: true },
//       });

//       if (!chat) {
//         set.status = 404;
//         return { message: "Chat not found" };
//       }

//       if (!chat.isPublic) {
//         const isParticipant = chat.users.some((u:any) => u.id === senderId);
//         if (!isParticipant) {
//           set.status = 403;
//           return { message: "Not a participant" };
//         }
//       }

//       try {
//         const savedMessage = await prisma.message.create({
//           data: {
//             content,
//             senderId,
//             receiverId: receiverId || null,
//             chatId,
//           },
//           include: {
//             sender: {
//               select: { id: true, name: true, username: true, image: true },
//             },
//           },
//         });

//         // Broadcast to everyone in the room via WS
//         // Note: In Elysia, we might need access to the server/ws instance to publish.
//         // If we don't have it here easily, we can use events to tell the WS handler to broadcast.
//         // But for now, returning the message is enough for the sender.
//         // Other participants will get it via PULL or WS if they are online.

//         events.emit("new_message", { chatId, message: savedMessage });

//         // Notify recipient if not active
//         const recipientUserId =
//           receiverId || chat.users.find((u:any) => u.id !== senderId)?.id;
          
//         if (recipientUserId && recipientUserId !== senderId) {
//             const isRecipientActive = activeChatParticipants.get(chatId)?.has(recipientUserId);
            
//             if (!isRecipientActive) {
//                 try {
//                     await prisma.notification.create({
//                     data: {
//                         type: "MESSAGE",
//                         recipientId: recipientUserId,
//                         issuerId: senderId,
//                     },
//                     });

//                     events.emit("notification", { recipientId: recipientUserId });
//                 } catch (e) {
//                     console.error("Failed to create message notification", e);
//                 }
//             } else {
//                 console.log(`Skipping notification for active user ${recipientUserId} in chat ${chatId} (via POST)`);
//             }
//         }

//         return savedMessage;
//       } catch (error) {
//         console.error("Error saving message via POST:", error);
//         set.status = 500;
//         return { message: "Internal server error" };
//       }
//     },
//     {
//       body: t.Object({
//         chatId: t.String(),
//         content: t.String(),
//         receiverId: t.Optional(t.String()),
//       }),
//     },
//   )
//   .get(
//     "/messages/:chatId",
//     async ({ params, query, user, set }) => {
//       if (!user) {
//         set.status = 401;
//         return { message: "Unauthorized" };
//       }

//       const { after } = query;
//       const where: any = { chatId: params.chatId };

//       if (after) {
//         where.createdAt = {
//           gt: new Date(Number(after)),
//         };
//       }

//       return await prisma.message.findMany({
//         where,
//         orderBy: { createdAt: "asc" },
//         include: {
//           sender: {
//             select: { id: true, name: true, username: true, image: true },
//           },
//         },
//       });
//     },
//     {
//       query: t.Object({
//         after: t.Optional(t.String()),
//       }),
//     },
//   );
