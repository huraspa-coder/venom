// server.js
const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const venom = require('venom-bot');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION = process.env.SESSION_NAME || 'venom-session';

app.use(bodyParser.json());

// Railway inyecta RAILWAY_VOLUME_MOUNT_PATH cuando adjuntas un Volume
const RAILWAY_VOLUME_MOUNT_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data';
const TOKENS_FOLDER = path.join(RAILWAY_VOLUME_MOUNT_PATH, 'venom_tokens');

// Ensure folder exists
fs.mkdirSync(TOKENS_FOLDER, { recursive: true });

console.log('Tokens will be stored in:', TOKENS_FOLDER);

// Aquí guardaremos el último QR generado
let lastQrPath = path.join(RAILWAY_VOLUME_MOUNT_PATH, 'out.png');
let venomClient;

venom
  .create(
    SESSION,
    // catchQR
    (base64Qrimg, asciiQR, attempts, urlCode) => {
      console.log('QR attempts:', attempts);
      try {
        const matches = base64Qrimg.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
        if (matches && matches[2]) {
          const buffer = Buffer.from(matches[2], 'base64');
          fs.writeFileSync(lastQrPath, buffer);
          console.log('✅ QR guardado en', lastQrPath);
        }
      } catch (e) {
        console.error('Error al guardar QR:', e.message);
      }
      // También mostramos QR en ASCII en los logs
      console.log(asciiQR);
    },
    (statusSession, session) => {
      console.log('Status Session: ', statusSession, ' session name: ', session);
    },
    {
      folderNameToken: 'venom_tokens',
      mkdirFolderToken: RAILWAY_VOLUME_MOUNT_PATH,
      headless: 'new',
      debug: false,
      logQR: false, // lo desactivo porque ahora ya lo guardamos en PNG
      disableSpins: true,
      puppeteerOptions: {
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
    venomClient = client;
    console.log('Venom listo, cliente en ejecución.');

    // Listener de mensajes entrantes
    client.onMessage((message) => {
      console.log('Mensaje recibido:', message.body, 'de', message.from);

      // (Ejemplo de respuesta automática, opcional)
      if (message.body === 'Hi' && !message.isGroupMsg) {
        client.sendText(message.from, 'Welcome Venom 🕷');
      }

      // Enviar mensaje entrante a Botpress (si configuras BOTPRESS_WEBHOOK_URL)
      if (process.env.BOTPRESS_WEBHOOK_URL) {
        const axios = require('axios');
        axios.post(process.env.BOTPRESS_WEBHOOK_URL, {
          from: message.from,
          body: message.body,
          type: message.type,
          isGroup: message.isGroupMsg,
        }).catch(err => console.error('Error enviando a Botpress:', err.message));
      }
    });
  })
  .catch((erro) => {
    console.error('Error creando cliente Venom:', erro);
  });

/* ========================
   API REST PARA BOTPRESS
   ======================== */

// Enviar mensaje a WhatsApp
app.post('/send-message', async (req, res) => {
  try {
    const { to, message } = req.body;
    if (!venomClient) {
      return res.status(503).json({ error: 'WhatsApp client not ready yet' });
    }
    const result = await venomClient.sendText(to, message);
    res.json({ success: true, result });
  } catch (err) {
    console.error('Error en /send-message:', err);
    res.status(500).json({ error: err.message });
  }
});

// QR como PNG
app.get('/qr', (req, res) => {
  if (fs.existsSync(lastQrPath)) {
    res.sendFile(lastQrPath);
  } else {
    res.status(404).send('QR no generado aún. Revisa logs.');
  }
});

// Healthcheck
app.get('/', (req, res) => res.send('Venom service running ✅'));

app.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});
