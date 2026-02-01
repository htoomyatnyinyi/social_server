# FROM oven/bun:latest

# WORKDIR /app

# # Copy all files
# COPY . .

# # Install dependencies
# RUN bun install

# # Generate Prisma client
# RUN bunx prisma generate

# EXPOSE 8080

# # CMD ["sh", "-c", "bunx prisma db push && bun run src/index.ts"]
# # Generate the client immediately before starting the app
# CMD ["sh", "-c", "bunx prisma generate && bunx prisma db push && bun run src/index.ts"]

# Change from 'latest' (which might be cached/old) to a specific modern version
FROM oven/bun:latest

WORKDIR /app

# Ensure we don't copy local node_modules
COPY . .

RUN bun install

COPY . .

# Generate client and run
RUN bunx prisma generate

CMD ["bun", "run", "src/index.ts"]