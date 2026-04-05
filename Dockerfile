FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npx prisma generate && npx prisma validate

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
