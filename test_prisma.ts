import prisma from "./src/lib/prisma";

async function main() {
  try {
    const users = await prisma.user.findMany();
    console.log("Found users:", users.length);
    process.exit(0);
  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  }
}

main();
