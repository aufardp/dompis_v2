# STAGE 1: Base & Install
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Salin package.json dan lock file
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (termasuk yang dibutuhkan untuk build)
RUN npm install --legacy-peer-deps

# STAGE 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate prisma & build aplikasi
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED 1
# Gunakan SKIP_ENV_VALIDATION=true jika kamu pakai zod-env
RUN SKIP_ENV_VALIDATION=true npm run build

# STAGE 3: Runner (Image Akhir yang Kecil)
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Security: Non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Salin file-file penting saja
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/app ./app
COPY --from=builder /app/dompis-99aa242a4864.json ./dompis-99aa242a4864.json

# Permission fix
RUN chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["npx", "tsx", "server.ts"]