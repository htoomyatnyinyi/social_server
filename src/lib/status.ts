import prisma from "./prisma";

export async function updateUserStatus(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { lastSeen: new Date() },
  });
}
