FROM node:20-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

# 🔥 kasih flag build
ENV PRISMA_GENERATE=true

RUN npx prisma generate

# balik ke normal
ENV PRISMA_GENERATE=false

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]