#Build stage
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json .

RUN npm install

COPY . .

RUN npm run build

#Production stage
FROM node:22-alpine AS production

ENV NODE_ENV=production 
ENV TWILIO_MENU_SID=HXb2342e0bd558f573290cc31bfa243bf3
ENV TWILIO_CARD_SID=HXc1f7d7f812161326aee81a806014790d
ENV TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
ENV PORT=8080

WORKDIR /app

COPY package*.json .

RUN npm ci --only=production

COPY --from=build /app/dist ./dist

EXPOSE 8080

CMD ["npm", "start"]