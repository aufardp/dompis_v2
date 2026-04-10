FROM node:20-alpine AS runner

# Instal openssl karena Prisma memerlukannya untuk runtime
RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Tambahkan user non-root demi keamanan
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Pastikan Anda sudah menjalankan 'npm run build' di local sebelum 'docker build'
# 1. Salin semua source code agar path alias @/ bisa dibaca tsx
COPY app ./app
COPY lib ./lib
COPY server.ts ./server.ts
COPY tsconfig.json ./tsconfig.json
COPY next-env.d.ts ./next-env.d.ts

# 2. Salin file kredensial Google (WAJIB)
COPY dompis-99aa242a4864.json ./dompis-99aa242a4864.json

# 3. Salin file .env agar terbaca oleh server.ts
COPY .env ./

# 4. Salin hasil build & node_modules dari Windows
COPY .next ./.next
COPY node_modules ./node_modules
COPY package.json ./package.json
COPY prisma ./prisma
COPY public ./public

# 5. Fix binary untuk Linux & Generate Prisma
RUN npm rebuild esbuild
RUN npx prisma generate

# 6. Pastikan permission folder benar
RUN chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

# Gunakan HOSTNAME 0.0.0.0 agar bisa diakses dari Windows
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Use next start directly (set in package.json)
CMD ["sh", "-c", "node node_modules/next/dist/bin/next start"]