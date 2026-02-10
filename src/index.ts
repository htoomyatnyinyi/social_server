import { Elysia, form } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { authRoutes } from "./routes/auth";
import { postRoutes } from "./routes/posts";
import { chatRoutes } from "./routes/chat";
import { profileRoutes } from "./routes/profile";
import { notificationRoutes } from "./routes/notifications";
import { settingsRoutes } from "./routes/settings";
import dotenv from "dotenv";
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
  .listen({
    port: process.env.PORT || 8080,
    hostname: process.env.HOST || "0.0.0.0",
  });

console.log(
  `🦊 Elysia server is running at ${app.server?.hostname}:${app.server?.port}`,
);
