// import Redis from "ioredis";

// const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

// export default redis;

import Redis from "ioredis";

// Use the environment variable, or fallback to 'redis' (the docker name)
const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379");

export default redis;
