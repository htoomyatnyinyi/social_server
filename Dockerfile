# FROM oven/bun:latest

# WORKDIR /app

# # Create the directory early so permissions are set correctly
# RUN mkdir -p /app/public

# COPY package.json bun.lock ./

# RUN bun install

# COPY . .

# RUN bunx prisma generate

# EXPOSE 8080

# # The public folder is now guaranteed to exist before this runs
# CMD ["sh", "-c", "bunx prisma db push && bun run src/index.ts"]

FROM oven/bun:latest

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./

RUN bun install

# Copy Prisma files and generate client
COPY prisma ./prisma/
RUN bunx prisma generate

# Copy application source
COPY . .

EXPOSE 8080

# Start server
CMD ["bun", "src/index.ts"]