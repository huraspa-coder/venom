// server.js
const fs = require("fs");
const path = require("path");
const express = require("express");
const venom = require("venom-bot");

const app = express();
const PORT = process.env.PORT || 3000;

// Ruta persistente en Railway (volumen montado en /data)
const SESSION_DIR = "/data/tokens";

// Crear directorio si no existe
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  console.log("📂 Carpeta creada:", SESSION_DIR);
}

// Iniciar cliente de Venom
venom
  .create(
    "venom-session",
    // Callback QR
    (base64Qr, asciiQR) => {
      console.log(asciiQR); // QR en consola
      const qrPath = path.join(SESSION_DIR, "qr.png");

      const matches = base64Qr.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const buffer = Buffer.from(matches[2], "base64");
        fs.writeFileSync(qrPath, buffer);
        console.log("✅ QR guardado en:", qrPath);
      }
    },
    undefined,
    {
      headless: true,
      logQR: false,
      browserPathExecutable: "/usr/bin/chromium",
      browserArgs: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
      // tokens se guardarán en /data/tokens
      mkdirFolderToken: SESSION_DIR,
      folderNameToken: "venom-session",
    }
  )
  .then((client) => start(client))
  .catch((erro) => {
    console.error("❌ Error iniciando Venom:", erro);
  });

// Función principal del bot
function start(client) {
  console.log("🤖 Venom BOT iniciado correctamente");

  client.onMessage((message) => {
    if (message.body.toLowerCase() === "hola") {
      client
        .sendText(message.from, "👋 Hola, soy tu bot en Railway!")
        .then(() => console.log("Mensaje enviado"))
        .catch((err) => console.error("Error al enviar mensaje", err));
    }
  });
}

// Endpoint para saber si está corriendo
app.get("/", (req, res) => {
  res.send("Venom BOT corriendo en Railway 🚀");
});

app.listen(PORT, () => {
  console.log(`🌍 Servidor escuchando en http://localhost:${PORT}`);
});
