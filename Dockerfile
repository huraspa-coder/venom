# Dockerfile para correr Venom con Chromium en Railway (Node 20)
FROM node:20-bullseye

# Evitar preguntas interactivas
ENV DEBIAN_FRONTEND=noninteractive

# Instalar dependencias para Chromium / Puppeteer
RUN apt-get update && apt-get install -y \
    ca-certificates wget gnupg --no-install-recommends && \
    apt-get install -y \
    fonts-liberation libappindicator3-1 libasound2 libatk1.0-0 libc6 \
    libcairo2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
    libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Instalar Chromium (opción simple)
RUN apt-get update && apt-get install -y chromium && rm -rf /var/lib/apt/lists/* || true

# Directorio de trabajo
WORKDIR /usr/src/app

# Copiar package.json y lock para instalar deps (mejor cache)
COPY package*.json ./

# Instalar solo dependencias necesarias y saltar scripts que no aplican en Railway
RUN npm install --production --ignore-scripts

# Copiar resto del repo
COPY . .

# Exponer puerto para endpoint opcional (ver server.js)
ENV PORT=3000

# Arranque
CMD ["node", "server.js"]