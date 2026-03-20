FROM node:20-alpine

# Dépendances système pour Baileys
RUN apk add --no-cache \
    python3 make g++ \
    chromium \
    nss freetype harfbuzz ca-certificates

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Dossier sessions persistant
RUN mkdir -p sessions

EXPOSE 3000

CMD ["node", "index.js"]
