import { describe, expect, test, beforeAll } from "bun:test";

const BASE_URL = "http://localhost:8080";

describe("Performance & Logic", () => {
  let token: string;
  let userId: string;
  let postId: string;

  beforeAll(async () => {
    // Authenticate
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123",
      }),
    });

    if (res.status !== 200) {
      const reg = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "password123",
          username: "tester_perf",
          name: "Tester",
        }),
      });
      const data = await reg.json();
      token = data.token;
      userId = data.user.id;
    } else {
      const data = await res.json();
      token = data.token;
      userId = data.user.id;
    }
  });

  test("GET /posts with cursor pagination", async () => {
    const start = performance.now();
    const res = await fetch(`${BASE_URL}/posts?limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const end = performance.now();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("posts");
    expect(data).toHaveProperty("nextCursor");
    console.log(`GET /posts took ${end - start}ms`);

    if (data.posts.length > 0) {
      postId = data.posts[0].id;
    }
  });

  test("GET /posts/feed with cursor pagination", async () => {
    const start = performance.now();
    const res = await fetch(`${BASE_URL}/posts/feed?limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const end = performance.now();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("posts");
    console.log(`GET /posts/feed took ${end - start}ms`);
  });

  test("POST /posts/:id/view (Redis)", async () => {
    if (!postId) return;
    const start = performance.now();
    const res = await fetch(`${BASE_URL}/posts/${postId}/view`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const end = performance.now();
    expect(res.status).toBe(200);
    console.log(`POST /view took ${end - start}ms`);
  });
});
