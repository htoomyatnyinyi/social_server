import { Elysia, form } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { authRoutes } from "./routes/auth";
import { postRoutes } from "./routes/posts";
import { chatRoutes } from "./routes/chat";
import { profileRoutes } from "./routes/profile";
import { notificationRoutes } from "./routes/notifications";
import { settingsRoutes } from "./routes/settings";
import { events } from "./lib/events";
import dotenv from "dotenv";
import { updateUserStatus } from "./lib/status";
dotenv.config();

const app = new Elysia()
  .use(cors())
  .use(staticPlugin())
  .get("/", () => ({ message: "SOCIAL_APP_SERVER IS RUNNING" }))
  .get("/health", () => ({ message: "SERVER IS HEALTHY" }))
  .use(authRoutes)
  .use(postRoutes)
  .use(chatRoutes)
  .use(profileRoutes)
  .use(notificationRoutes)
  .use(settingsRoutes)
  // ### start
  // .onStart(() => {
  //   console.log("Server started at", new Date().toISOString());
  // })
  // .onStop(() => {
  //   console.log("Server stopped at", new Date().toISOString());
  // })
  // .onBeforeHandle(({ request }) => {
  //   const user = request.user;
  //   if (user) {
  //     user.lastSeen = new Date();
  //   }
  // })

  // ## end
  .listen({
    port: process.env.PORT || 8080,
    hostname: process.env.HOST || "0.0.0.0",
  });

console.log(
  `🦊 Elysia server is running at ${app.server?.hostname}:${app.server?.port}`,
);

events.on("notification", ({ recipientId }) => {
  const topic = `user:${recipientId}`;
  console.log(`Broadcasting notification refresh to ${topic}`);
  app.server?.publish(topic, JSON.stringify({ type: "refresh" }));
});

events.on("new_message", ({ chatId, message }) => {
  console.log(`Broadcasting new message to chat: ${chatId}`);
  const response = {
    type: "new_message",
    ...message,
  };
  app.server?.publish(chatId, JSON.stringify(response));
});
