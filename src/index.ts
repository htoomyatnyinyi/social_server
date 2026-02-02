// import { Elysia } from "elysia";
// import { cors } from "@elysiajs/cors";
// import { staticPlugin } from "@elysiajs/static";
// import { websocket } from "@elysiajs/websocket";
// import { authRoutes } from "./routes/auth";
// import { postRoutes } from "./routes/posts";
// import { chatRoutes } from "./routes/chat";

// const app = new Elysia()
//   .use(cors())
//   .use(staticPlugin())
//   .use(websocket())
//   .get("/", () => ({ message: "Social App API is running" }))
//   .use(authRoutes)
//   .use(postRoutes)
//   .use(chatRoutes)

//   .listen(process.env.PORT || 8080);

// console.log(
//   `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
// );

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
// DELETE THIS: import { websocket } from "@elysiajs/websocket";
import { authRoutes } from "./routes/auth";
import { postRoutes } from "./routes/posts";
import { chatRoutes } from "./routes/chat";

const app = new Elysia()
  .use(cors())
  .use(staticPlugin())
  // DELETE THIS: .use(websocket())
  .get("/", () => ({ message: "Social App API is running" }))
  .use(authRoutes)
  .use(postRoutes)
  .use(chatRoutes)
  .listen(process.env.PORT || 8080);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
