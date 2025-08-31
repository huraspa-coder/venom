const express = require('express');
const path = require('path');
const fs = require('fs');
const venom = require('venom-bot');

const app = express();
const PORT = process.env.PORT || 3000;
const VENOM_PATH = process.env.VENOM_TOKENS_PATH || '/data';

// Crear sesión
venom.create(
  'venom-session',
  (base64Qr, asciiQR, attempts, urlCode) => {
    console.log("⚡ QR generado, intenta escanearlo en /qr");

    // Guardar QR en PNG
    const base64Data = base64Qr.replace(/^data:image\/png;base64,/, "");
    const filePath = path.join(VENOM_PATH, 'qr.png');

    fs.writeFileSync(filePath, base64Data, 'base64');
    console.log("✅ QR guardado en:", filePath);
  },
  undefined,
  { logQR: false }
).then((client) => {
  console.log("🚀 Cliente Venom iniciado");
  start(client);
}).catch((err) => console.error("❌ Error iniciando Venom:", err));

function start(client) {
  client.onMessage((message) => {
    if (message.body === 'ping') {
      client.sendText(message.from, 'pong');
    }
  });
}

// Endpoint para ver el QR
app.get('/qr', (req, res) => {
  const filePath = path.join(VENOM_PATH, 'qr.png');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send("QR no disponible aún, revisa los logs");
  }
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
