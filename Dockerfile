FROM ubuntu:22.04

RUN apk update && apk add --no-cache nodejs npm python3 py3-pip && \
    pip install -U yt-dlp --break-system-packages

WORKDIR /api

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE $PORT

CMD ["npm", "start"]
