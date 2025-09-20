# Lightweight, predictable build without Nixpacks
FROM node:18-alpine

# System deps (optional but handy)
RUN apk add --no-cache curl

WORKDIR /app

# Install only production deps
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy the rest
COPY . .

# Env
ENV PORT=8889
ENV DOWNLOAD_DIR=/data/downloads
ENV ONE_TIME_DOWNLOAD=true
ENV RETENTION_HOURS=24

# Make sure download dir exists inside container (mounted in Coolify)
RUN mkdir -p /data/downloads

EXPOSE 8889

CMD ["node","server.js"]