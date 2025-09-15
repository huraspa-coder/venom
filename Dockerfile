# Dockerfile para correr Venom con Chromium en Railway (Node 20)
FROM node:20-bookworm-slim

# Evitar preguntas interactivas
ENV DEBIAN_FRONTEND=noninteractive

# Instalar dependencias necesarias para Chromium / Puppeteer
RUN apt-get update && apt-get install -y \
    ca-certificates wget gnupg --no-install-recommends && \
    apt-get install -y \
    fonts-liberation libappindicator3-1 libasound2 libatk1.0-0 libc6 \
    libcairo2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
    libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
    chromium \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Crear carpeta de trabajo
WORKDIR /usr/src/app

# Copiar package.json y package-lock.json para aprovechar cache de npm
COPY package*.json ./

# Instalar dependencias
RUN npm install --production --ignore-scripts

# Copiar el resto del proyecto
COPY . .

# Exponer el puerto
ENV PORT=3000

# Comando de arranque
CMD ["node", "server.js"]
