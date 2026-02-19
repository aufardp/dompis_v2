import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
    // Optional: only needed for `prisma migrate dev` / `prisma migrate diff` with migrations.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
