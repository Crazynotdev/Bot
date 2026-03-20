FROM node:20-slim

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production --no-optional

COPY . .

RUN mkdir -p sessions

EXPOSE 3000

CMD ["node", "index.js"]
