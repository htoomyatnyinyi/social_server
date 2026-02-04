import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
// import { websocket } from "@elysiajs/websocket";
import { authRoutes } from "./routes/auth";
import { postRoutes } from "./routes/posts";
import { chatRoutes } from "./routes/chat";
import { profileRoutes } from "./routes/profile";
import { notificationRoutes } from "./routes/notifications";
import { settingsRoutes } from "./routes/settings";

const app = new Elysia()
  .use(cors())
  .use(staticPlugin())
  // .use(websocket())
  .get("/status", () => ({ message: "SOCIAL_APP_SERVER IS RUNNING" }))
  .use(authRoutes)
  .use(postRoutes)
  .use(chatRoutes)
  .use(profileRoutes)
  .use(notificationRoutes)
  .use(settingsRoutes)
  .listen(process.env.PORT || 8080);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
