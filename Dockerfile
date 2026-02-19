FROM ubuntu:22.04

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        python3 \
        python3-pip && \
    # Install Node.js 20 from NodeSource
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    pip3 install --no-cache-dir -U yt-dlp && \
    # Clean up
    apt-get purge -y curl && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /api

COPY package*.json ./

# --- Development Stage ---
FROM ubuntu:22.04 AS dev
WORKDIR /api
RUN apt-get update && apt-get install -y curl ca-certificates python3 python3-pip && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    pip3 install --no-cache-dir -U yt-dlp
COPY package*.json ./
RUN npm install
COPY . .
ENV NODE_ENV=development
CMD ["npm", "run", "dev"]

# --- Production Stage ---
FROM ubuntu:22.04 AS prod
WORKDIR /api
RUN apt-get update && apt-get install -y curl ca-certificates python3 python3-pip && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    pip3 install --no-cache-dir -U yt-dlp
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
