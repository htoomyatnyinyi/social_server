# Social Server

This is the backend server for the Oasis Social App, built with [Elysia](https://elysiajs.com/) and Prisma ORM, running on Bun. It provides RESTful APIs for authentication, posts, profiles, chat, notifications, and settings.

## Features
- User authentication (JWT)
- Post creation, feed, likes, bookmarks, comments, reposts
- User profiles, followers, suggestions
- Real-time chat (WIP)
- Content moderation (AI-powered)
- Admin/moderation endpoints
- Dockerized for easy deployment

## Tech Stack
- [Elysia](https://elysiajs.com/) (Bun web framework)
- [Prisma ORM](https://www.prisma.io/)
- MySQL (default, can be swapped)
- Redis (for caching, views, etc.)
- Cloudinary (image uploads)
- Docker

## Getting Started

### Prerequisites
- [Bun](https://bun.sh/) (v1.0+)
- [Docker](https://www.docker.com/) (for DB/Redis)

### Setup
1. Clone the repo:
   ```sh
   git clone <repo-url>
   cd social_server
   ```
2. Install dependencies:
   ```sh
   bun install
   ```
3. Copy and edit `.env`:
   ```sh
   cp .env.example .env
   # Edit DB/Redis/Cloudinary keys
   ```
4. Start MySQL and Redis (recommended via Docker Compose):
   ```sh
   docker-compose up -d
   ```
5. Run migrations and generate Prisma client:
   ```sh
   bunx prisma migrate deploy
   bunx prisma generate
   ```
6. Start the server:
   ```sh
   bun run src/index.ts
   # or use Docker
   docker build -t social-server .
   docker run --env-file .env -p 8080:8080 social-server
   ```

## API Endpoints
- `/auth` - Authentication (register, login, etc.)
- `/posts` - Posts, likes, bookmarks, comments, reports
- `/profile` - User profiles, followers, suggestions
- `/chat` - Chat endpoints
- `/notifications` - Notifications
- `/settings` - User settings

See the code for detailed endpoint docs.

## Development
- Test with [Bun Test](https://bun.sh/docs/test)
- Use `.rest` files or Postman for API testing

## License
MIT
