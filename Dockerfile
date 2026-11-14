FROM node:20-bookworm-slim

# Install Chromium, curl, and essential system dependencies for Puppeteer & WhatsApp Web
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    curl \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
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

# Set Puppeteer and Node environment for production
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
RUN mkdir -p public .wwebjs_auth

# Expose web dashboard port
EXPOSE 3000

# Healthcheck for Dokploy / Docker container monitoring
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start Seranex Lanka Solutions 24/7 Command Center & Sales Engine
CMD ["node", "dashboard.js"]
