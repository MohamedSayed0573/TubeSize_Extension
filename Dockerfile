FROM ubuntu:22.04

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        nodejs \
        npm \
        python3 \
        python3-pip && \
    pip3 install --no-cache-dir -U yt-dlp

WORKDIR /api

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE $PORT

CMD ["npm", "start"]
