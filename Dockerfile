FROM alpine:latest

RUN apk update && apk add --no-cache nodejs npm python3 py3-pip
RUN pip install -U yt-dlp --break-system-packages

WORKDIR /api

COPY package.json ./

RUN npm install

COPY . .

ENV PORT=3000

EXPOSE $PORT

CMD ["npm", "start"]
