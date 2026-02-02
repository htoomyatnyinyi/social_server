FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

COPY . .

# Generate Prisma client
RUN bunx prisma generate

EXPOSE 8080

CMD ["sh", "-c", "bunx prisma db push && bun run src/index.ts"]


# # # # # FROM oven/bun:1.1.34

# # # # # # FROM oven/bun:1.1.20

# # # # # WORKDIR /app

# # # # # # 1. Install dependencies first (better caching)
# # # # # COPY package.json bun.lockb* ./ 

# # # # # RUN bun install

# # # # # # 2. Copy Prisma schema and generate client
# # # # # # Doing this before copying the whole project saves time on rebuilds
# # # # # COPY prisma ./prisma/

# # # # # RUN bunx prisma generate

# # # # # # 3. Copy the rest of the app
# # # # # COPY . .

# # # # # EXPOSE 8080

# # # # # # 4. Use a shell script or wait-for-it for complex startups
# # # # # CMD ["sh", "-c", "bunx prisma db push && bun run src/index.ts"]

# # # # # Use the Debian-based Bun image which includes more utilities
# # # # FROM oven/bun:1.1.34-debian

# # # # WORKDIR /app

# # # # # IMPORTANT: These must be set BEFORE 'bun install'
# # # # ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
# # # # ENV SKIP_PRISMA_VERSION_CHECK=true

# # # # # Copy only dependency files
# # # # COPY package.json bun.lockb* ./

# # # # # Install with scripts disabled to bypass the Prisma check entirely
# # # # RUN bun install --ignore-scripts

# # # # # Copy the prisma folder specifically
# # # # COPY prisma ./prisma/

# # # # # Manually generate the client (this uses the engine directly)
# # # # RUN bunx prisma generate

# # # # # Copy the rest of the project
# # # # COPY . .

# # # # EXPOSE 8080

# # # # CMD ["sh", "-c", "bunx prisma db push && bun run src/index.ts"]

# # # FROM oven/bun:1.1.34-debian

# # # WORKDIR /app

# # # ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1

# # # # Delete any potential local node_modules being copied in accidentally
# # # # and ensure we have a fresh start
# # # COPY package.json bun.lockb* ./
# # # RUN rm -rf node_modules && bun install --ignore-scripts

# # # COPY prisma ./prisma/
# # # RUN bunx prisma generate

# # # COPY . .

# # # EXPOSE 8080

# # # CMD ["sh", "-c", "bunx prisma db push && bun run src/index.ts"]
# # FROM oven/bun:1.1.34

# # WORKDIR /app

# # # Bypasses the Prisma Node.js version check
# # ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1

# # # 1. Copy package files
# # COPY package.json ./
# # # We delete the lockfile here to force Bun to resolve fresh, 
# # # compatible versions inside the container
# # RUN rm -f bun.lockb

# # # 2. Install fresh
# # RUN bun install --ignore-scripts

# # # 3. Handle Prisma
# # COPY prisma ./prisma/
# # RUN bunx prisma generate

# # # 4. Copy source
# # COPY . .

# # EXPOSE 8080

# # CMD ["sh", "-c", "bunx prisma db push && bun run src/index.ts"]

# FROM oven/bun:1.1.34

# WORKDIR /app

# # Bypassing the Prisma 7 pre-install check
# ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1

# COPY package.json ./
# # Remove lockfile to force a clean version resolution based on your new package.json
# RUN rm -f bun.lockb && bun install --ignore-scripts

# COPY prisma ./prisma/
# RUN bunx prisma generate

# COPY . .

# EXPOSE 8080

# CMD ["sh", "-c", "bunx prisma db push && bun run src/index.ts"]

# # CMD ["sh", "-c", "bunx prisma migrate deploy && bun run src/index.ts"]