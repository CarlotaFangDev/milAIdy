FROM node:18-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Persistent data directory – on Render, mount a persistent disk at /data
# and set DATA_DIR=/data in environment variables
RUN mkdir -p /data

EXPOSE 8080
CMD ["node", "index.js"]
