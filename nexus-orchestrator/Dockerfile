FROM node:20-slim

WORKDIR /app

COPY package*.json ./

# Update npm to the latest version and then run a clean install
RUN npm install -g npm@latest && npm ci

COPY . .

EXPOSE 3000

CMD [ "npm", "run", "dev" ]
