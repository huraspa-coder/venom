// server.js - arranca venom y opcionalmente sirve el QR como imagen
const fs = require('fs');
const path = require('path');
const express = require('express');
const venom = require('venom-bot');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION = process.env.SESSION_NAME || 'venom-session';

// Railway inyecta RAILWAY_VOLUME_MOUNT_PATH cuando adjuntas un Volume
const RAILWAY_VOLUME_MOUNT_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data/tokens';
const TOKENS_FOLDER = path.join(RAILWAY_VOLUME_MOUNT_PATH, 'venom_tokens');

// Ensure folder exists
fs.mkdirSync(TOKENS_FOLDER, { recursive: true });

console.log('Tokens will be stored in:', TOKENS_FOLDER);

let lastQrPath = path.join(TOKENS_FOLDER, 'out.png');

venom
  .create(
    SESSION,
    // catchQR: guardar png en volume para que puedas ver/descargar
    (base64Qrimg, asciiQR, attempts, urlCode) => {
      console.log('QR attempts:', attempts);
      try {
        const matches = base64Qrimg.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
        if (matches && matches[2]) {
          const buffer = Buffer.from(matches[2], 'base64');
          fs.writeFileSync(lastQrPath, buffer);
          console.log('QR guardado en', lastQrPath);
        }
      } catch (e) {
        console.error('Error al guardar QR:', e.message);
      }
      // asciiQR también aparece en logs
      console.log(asciiQR);
    },
    // status callback
    (statusSession, session) => {
      console.log('Status Session: ', statusSession, ' session name: ', session);
    },
    // options
    {
      folderNameToken: 'venom_tokens',
      mkdirFolderToken: RAILWAY_VOLUME_MOUNT_PATH, // VENOM guardará tokens aquí
      headless: 'new',
      debug: false,
      logQR: true,
      disableSpins: true,
      puppeteerOptions: {
        // Ajusta ejecutable si lo necesitas
        executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--single-process',
          '--disable-gpu'
        ],
      },
    }
  )
  .then((client) => {
    console.log('Venom listo, cliente en ejecución.');
    client.onMessage((message) => {
      // ejemplo simple de respuesta — puedes quitarlo
      if (message.body === 'Hi' && !message.isGroupMsg) {
        client.sendText(message.from, 'Welcome Venom 🕷');
      }
    });
  })
  .catch((erro) => {
    console.error('Error creando cliente Venom:', erro);
  });

// Endpoint para descargar/ver QR
app.get('/qr', (req, res) => {
  if (fs.existsSync(lastQrPath)) {
    res.sendFile(lastQrPath);
  } else {
    res.status(404).send('QR no generado aún. Revisa logs.');
  }
});

app.get('/', (req, res) => res.send('Venom service running'));

app.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});
