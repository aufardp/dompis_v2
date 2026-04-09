FROM node:20-alpine

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY package*.json ./

RUN npm install --legacy-peer-deps

COPY . .

# generate prisma client
RUN npx prisma generate

# build nextjs with dummy env vars for static routes
RUN SPREADSHEET_ID=1y2a0FTik5ZCHaq8NW3NLb9ccPjK4fZsV9lCenCsvVTg SECRET_KEY=dummy DATABASE_URL=mysql://dompis_user:dompis_password@mysql:3306/dompis_db?connection_limit=25 GOOGLE_CLIENT_ID=dummy GOOGLE_CLIENT_SECRET=dummy GOOGLE_REDIRECT_URI=dummy npm run build

EXPOSE 3000

CMD ["npm", "start"]
