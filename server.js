const express = require("express");
const venom = require("venom-bot");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_NAME = process.env.SESSION_NAME || "venom-session";
const VENOM_TOKENS_PATH = process.env.VENOM_TOKENS_PATH || "./tokens";

let qrCodeBase64 = null;

// Iniciar Venom
venom
  .create({
    session: SESSION_NAME,
    multidevice: true,
    headless: true,
    folderNameToken: VENOM_TOKENS_PATH,
    mkdirFolderToken: VENOM_TOKENS_PATH,
    logQR: false, // ⛔ no log en consola
    catchQR: (base64Qr, asciiQR) => {
      console.log("✅ QR recibido, disponible en /qr");
      qrCodeBase64 = base64Qr;
    },
  })
  .then((client) => start(client))
  .catch((err) => console.error(err));

function start(client) {
  console.log("✅ Venom iniciado correctamente en Railway");
  client.onMessage((message) => {
    if (message.body === "Hola") {
      client.sendText(message.from, "¡Hola! Bot conectado 🚀");
    }
  });
}

// Endpoint para ver el QR
app.get("/qr", (req, res) => {
  if (!qrCodeBase64) {
    return res.send("⚡ QR aún no generado. Recarga en unos segundos...");
  }
  res.send(`
    <html>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;">
        <h2>Escanea el QR con WhatsApp 📱</h2>
        <img src="${qrCodeBase64}" />
      </body>
    </html>
  `);
});

// Endpoint de salud
app.get("/", (req, res) => {
  res.send("Venom BOT corriendo en Railway 🚀");
});

app.listen(PORT, () => console.log(`✅ Servidor escuchando en puerto ${PORT}`));
