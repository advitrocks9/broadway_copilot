#Build stage
FROM node:22-slim AS build

WORKDIR /app

COPY package*.json .

RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

#Production stage
FROM node:22-slim AS production

WORKDIR /app

COPY package*.json .

RUN npm ci --only=production

COPY --from=build /app/dist ./dist
COPY --from=build /app/prompts ./prompts
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma/client ./node_modules/.prisma/client

EXPOSE 8080

CMD ["npm", "start"]