import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import prisma from "../lib/prisma";
import bcrypt from "bcryptjs";

export const settingsRoutes = new Elysia({ prefix: "/settings" })
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
  .post(
    "/change-password",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { message: "Unauthorized" };
      }

      const { currentPassword, newPassword } = body;
      const userId = user.id as string;

      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!dbUser || !dbUser.password) {
        set.status = 404;
        return { message: "User not found" };
      }

      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        dbUser.password,
      );

      if (!isPasswordValid) {
        set.status = 400;
        return { message: "Invalid current password" };
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      return { message: "Password updated successfully" };
    },
    {
      body: t.Object({
        currentPassword: t.String(),
        newPassword: t.String({ minLength: 6 }),
      }),
    },
  )
  .delete("/account", async ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { message: "Unauthorized" };
    }

    const userId = user.id as string;

    await prisma.user.delete({
      where: { id: userId },
    });

    return { message: "Account deleted successfully" };
  });
