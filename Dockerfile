FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

COPY . .

# Generate Prisma client
RUN bunx prisma generate

EXPOSE 8080

CMD ["sh", "-c", "bunx prisma db push && bun run src/index.ts"]

