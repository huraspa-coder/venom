// server.js
const fs = require("fs");
const path = require("path");
const express = require("express");
const venom = require("venom-bot");
const app = express();
const PORT = process.env.PORT || 3000;

// Carpeta persistente en Railway
const SESSION_DIR = "/data/tokens";
const QR_PATH = path.join(SESSION_DIR, "qr.png");

// Crear carpeta si no existe
fs.mkdirSync(SESSION_DIR, { recursive: true });
console.log("📂 Carpeta de tokens asegurada en:", SESSION_DIR);

// Endpoint para ver el QR
app.get("/qr", (req, res) => {
  if (fs.existsSync(QR_PATH)) {
    res.sendFile(QR_PATH);
  } else {
    res.status(404).send("QR aún no generado");
  }
});

// Endpoint para status de sesión
app.get("/status", (req, res) => {
  if (venomClient && venomClient.isConnected()) {
    res.json({ status: "logged", message: "Cliente WhatsApp conectado ✅" });
  } else {
    res.json({ status: "not_logged", message: "Cliente esperando QR o no iniciado ❌" });
  }
});

let venomClient;

// Crear sesión Venom
venom
  .create(
    "venom-session",
    (base64Qr) => {
      // Guardar QR en PNG
      const matches = base64Qr.match(/^data:image\/png;base64,(.+)$/);
      if (matches) {
        const buffer = Buffer.from(matches[1], "base64");
        fs.writeFileSync(QR_PATH, buffer, "binary");
        console.log("✅ QR guardado en:", QR_PATH);
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
      mkdirFolderToken: SESSION_DIR,
      folderNameToken: "venom-session",
    }
  )
  .then((client) => {
    venomClient = client;
    console.log("🤖 Venom iniciado correctamente");
    client.onMessage((message) => {
      if (message.body.toLowerCase() === "hola") {
        client.sendText(message.from, "👋 Hola, bot funcionando!").catch(console.error);
      }
    });
  })
  .catch((err) => console.error("❌ Error iniciando Venom:", err));

// Healthcheck
app.get("/", (req, res) => res.send("Venom BOT corriendo en Railway 🚀"));

app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});
