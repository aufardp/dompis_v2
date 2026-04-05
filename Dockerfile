FROM node:20-slim

WORKDIR /app

# 🔥 install dependency OS yang dibutuhkan Prisma
RUN apt-get update -y && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

# 🔥 generate prisma (setelah openssl ada)
RUN npx prisma generate

# build next
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]