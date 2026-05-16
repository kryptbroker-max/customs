FROM node:20-slim

# Install required packages for Puppeteer / headless Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk1.0-0 \
    libnss3 \
    libatk-bridge2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libfreetype6 \
    libx11-xcb1 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libgbm1 \
    libgtk-3-0 \
    libglib2.0-0 \
    libnspr4 \
    libxss1 \
    libxtst6 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libxcb-shm0 \
    libxcb-dri3-0 \
    libxshmfence1 \
    xdg-utils \
    lsb-release \
    wget \
 && rm -rf /var/lib/apt/lists/*

# Create a dedicated non-root user for Puppeteer/Chromium runtime
RUN groupadd -r pptruser \
    && useradd -r -g pptruser -G audio,video -m -d /home/pptruser -s /bin/bash pptruser \
    && mkdir -p /usr/src/app /home/pptruser/.cache/puppeteer \
    && chown -R pptruser:pptruser /usr/src/app /home/pptruser

WORKDIR /usr/src/app

# Copy application files with correct ownership
COPY --chown=pptruser:pptruser package.json package-lock.json* ./
COPY --chown=pptruser:pptruser . .

USER pptruser

# Skip Puppeteer's own Chromium download since we installed the system package
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    HOME=/home/pptruser \
    PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer \
    NODE_ENV=production

# Install dependencies as non-root
RUN npm ci --no-audit --no-fund

# Expose port
EXPOSE 3000

CMD ["node", "src/index.js"]
