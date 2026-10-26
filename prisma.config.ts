import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // Generating types works without a database; database commands require a real URL.
  datasource: { url: process.env.NUXT_DATABASE_URL ?? '' },
})
