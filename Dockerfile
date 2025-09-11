#Build stage
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json .

RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

#Production stage
FROM node:22-alpine AS production

WORKDIR /app

COPY package*.json .

RUN npm ci --only=production

COPY --from=build /app/dist ./dist
COPY --from=build /app/prompts ./prompts
COPY --from=build /app/prisma ./prisma

RUN npx prisma generate

EXPOSE 8080

CMD ["npm", "start"]