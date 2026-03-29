FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY dist ./dist

EXPOSE 8080

ENV PORT=8080

CMD ["node", "dist/index.js"]
