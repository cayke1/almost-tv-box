FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY --from=0 /app/dist ./dist

EXPOSE 8080

ENV PORT=8080

CMD ["node", "dist/index.js"]
