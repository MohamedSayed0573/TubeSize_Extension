FROM alpine:latest

RUN apk update && apk add nodejs npm && apk add --no-cache python3 py3-pip && pip install -U yt-dlp --break-system-packages

WORKDIR /api

COPY package.json ./

RUN npm install

COPY . .

ENV PORT=3000

EXPOSE $PORT

CMD ["npm", "start"]
