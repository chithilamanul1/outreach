FROM node:20-bookworm-slim

# Install Chromium and system dependencies required for Puppeteer / WhatsApp
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Copy dependency files and install production packages
COPY package*.json ./
COPY scripts/ ./scripts/
RUN npm install --omit=dev

# Copy application source code
COPY . .

# Ensure storage directories exist
RUN mkdir -p rate_sheets/3_star rate_sheets/4_star rate_sheets/5_star .wwebjs_auth

EXPOSE 3000

CMD ["node", "dashboard.js"]
