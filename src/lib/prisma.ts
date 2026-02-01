// import { PrismaMariaDb } from "@prisma/adapter-mariadb";
// import { PrismaClient } from "@prisma/client";
// import mariadb from "mariadb";

// const pool = mariadb.createPool(process.env.DATABASE_URL!);
// const adapter = new PrismaMariaDb(pool);
// const prisma = new PrismaClient({ adapter });

// export default prisma;

// import { PrismaClient } from "@prisma/client";

import { PrismaClient } from "@prisma/client";

// This is much more stable and requires zero extra configuration
const prisma = new PrismaClient();

export default prisma;
