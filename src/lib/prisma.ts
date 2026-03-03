// // import { Pool } from "pg";
// // import { PrismaPg } from "@prisma/adapter-pg";
// // import { PrismaClient } from "@prisma/client"; // Use standard import

// // const globalForPrisma = global as unknown as {
// //   prisma: PrismaClient | undefined;
// // };

// // const pool = new Pool({
// //   connectionString: process.env.DATABASE_URL,
// // });

// // const adapter = new PrismaPg(pool);

// // export const prisma =
// //   globalForPrisma.prisma ??
// //   new PrismaClient({
// //     adapter,
// //   });

// // if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// // export default prisma;

// // // import { Pool } from "pg";
// // // import { PrismaPg } from "@prisma/adapter-pg";
// // // // IMPORTANT: In v7, if you use a custom output,
// // // // you MUST import the class from that specific folder.
// // // import { PrismaClient } from "@/prisma/generated/prisma/client";

// // // const globalForPrisma = global as unknown as {
// // //   prisma: PrismaClient | undefined;
// // // };

// // // const pool = new Pool({
// // //   connectionString: process.env.DATABASE_URL,
// // // });

// // // const adapter = new PrismaPg(pool);

// // // export const prisma =
// // //   globalForPrisma.prisma ??
// // //   new PrismaClient({
// // //     // In v7, the adapter is passed directly here
// // //     adapter,
// // //   });

// // // if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// // // export default prisma;

// // import { PrismaClient } from "@prisma/client";
// // postgresql
// import { PrismaClient } from "@prisma/client";
// import { PrismaPg } from "@prisma/adapter-pg";
// // import { PrismaClient } from "@/prisma/generated/prisma/client";
// // import { PrismaClient } from "@prisma/client";

// const globalForPrisma = global as unknown as {
//   prisma: PrismaClient;
// };

// const adapter = new PrismaPg({
//   connectionString: process.env.DATABASE_URL,
// });

// const prisma =
//   globalForPrisma.prisma ||
//   new PrismaClient({
//     adapter,
//   });

// if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// export default prisma;

// // // // // // mysql
// // // // // import "dotenv/config";
// // // // // import { PrismaMariaDb } from "@prisma/adapter-mariadb";
// // // // // import { PrismaClient } from "@prisma/client";

// // // // // const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
// // // // // const prisma = new PrismaClient({ adapter });

// // // // // export default prisma;

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined;
};

// Use the URL from your updated .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
