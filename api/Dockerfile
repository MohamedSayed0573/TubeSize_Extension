# --- Base Stage ---
FROM node:lts-alpine3.22 AS base
WORKDIR /api
RUN apk add --no-cache curl py3-pip && \
    pip3 install  --break-system-packages --no-cache-dir -U yt-dlp \
    wget -qO- https://get.pnpm.io/install.sh | sh -
COPY package*.json ./

# --- Development Stage ---
FROM base AS dev
RUN npm install
COPY . .
ENV NODE_ENV=development
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "run", "dev"]

# --- Production Stage ---
FROM base AS prod
RUN npm ci
COPY . .
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]

# --- Staging Stage ---
FROM base AS staging
RUN npm ci
COPY . .
ENV NODE_ENV=staging
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "run", "dev"]
