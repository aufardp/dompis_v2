FROM node:20-alpine

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# generate prisma client
RUN npx prisma generate

# build nextjs
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]