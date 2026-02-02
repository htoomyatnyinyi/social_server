import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import prisma from "../lib/prisma";
import bcrypt from "bcryptjs";

export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
    }),
  )
  .post(
    "/signup",
    async ({ body, jwt, set }) => {
      const { email, password, name, username } = body;

      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { username }],
        },
      });

      if (existingUser) {
        set.status = 400;
        return { message: "Email or Username already exists" };
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          email,
          username,
          password: hashedPassword,
          name,
        },
      });

      const token = await jwt.sign({
        id: user.id,
        email: user.email,
      });

      return {
        message: "User created successfully",
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
        },
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 6 }),
        username: t.String({ minLength: 3 }),
        name: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/signin",
    async ({ body, jwt, set }) => {
      const { email, password } = body;

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user || !user.password) {
        set.status = 401;
        return { message: "Invalid credentials" };
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        set.status = 401;
        return { message: "Invalid credentials" };
      }

      const token = await jwt.sign({
        id: user.id,
        email: user.email,
      });

      return {
        message: "Signed in successfully",
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
          image: user.image,
        },
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String(),
      }),
    },
  )
  .get("/users", async ({ query }) => {
    const { search } = query;
    return await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: search as string } },
          { username: { contains: search as string } },
          { email: { contains: search as string } },
        ],
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        image: true,
      },
      take: 10,
    });
  });
