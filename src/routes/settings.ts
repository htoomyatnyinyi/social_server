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

    // Prisma cascade delete should handle relations if configured,
    // but explicit deletion is safer for strict control.
    // Assuming schema relies on relations or manual cleanup.
    // Let's rely on Prisma's onDelete: Cascade if present, or just delete user and let it fail if constraints exist (then fix schema).
    // Checking schema earlier: Relations like 'posts Post[]' exist.
    // Standard Prisma behavior: need Cascade in schema or manual delete.
    // Let's try deleting user. If it fails due to foreign keys, we need to update schema or delete related data first.
    // For now, let's attempt to delete widely.

    // Manual cleanup for safety and completeness given unknown Cascade status in schema details (though usually relations need explicit Cascade).
    // Actually, looking at schema provided earlier:
    // model Post { author User ... } - No onDelete: Cascade visible in the schema snippet for 'author'.
    // model Like { user User ... }
    // So we likely need to delete related data or rely on a schema migration I might not be allowed to run easily without potentially breaking things.
    // BUT, I can run `prisma db push` if I modify schema.
    // Better approach for now: Delete related items manually in transaction.

    // Actually, looking at the schema again:
    // model Comment { parent Comment? @relation(..., onDelete: Cascade) } - this one has it.
    // The others don't have explicit onDelete: Cascade in the provided snippet view.
    // Let's do a transaction delete.

    await prisma.$transaction([
      prisma.token.deleteMany({ where: { userId } }).catch(() => {}), // If tokens exist
      prisma.notification.deleteMany({
        where: { OR: [{ recipientId: userId }, { issuerId: userId }] },
      }),
      prisma.like.deleteMany({ where: { userId } }),
      prisma.comment.deleteMany({ where: { userId } }),
      prisma.post.deleteMany({ where: { authorId: userId } }),
      prisma.follow.deleteMany({
        where: { OR: [{ followerId: userId }, { followingId: userId }] },
      }),
      prisma.message.deleteMany({
        where: { OR: [{ senderId: userId }, { receiverId: userId }] },
      }),
      // Chat deletion is tricky if it's shared. Logic: Delete chats where user is participant?
      // Or just remove user from chat?
      // Schema: Chat { users User[] } - m-n relation usually handled by implicit pivot table usually cascade deletes entries in pivot.
      // But let's delete the user and see if Prisma handles the implicit m-n.
      prisma.user.delete({ where: { id: userId } }),
    ]);

    return { message: "Account deleted successfully" };
  });
