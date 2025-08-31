// server.js
const express = require("express");
const venom = require("venom-bot");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SESSION_NAME = process.env.SESSION_NAME || "venom-session";
const VENOM_TOKENS_PATH = process.env.VENOM_TOKENS_PATH || "/data/tokens";
const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || "/data";

// Carpeta de sesión persistente
const SESSION_DIR = path.join(VOLUME_PATH, "venom-session");
const QR_PATH = path.join(SESSION_DIR, "qr.png");

// Crear carpeta si no existe
fs.mkdirSync(SESSION_DIR, { recursive: true });
console.log("📂 Carpeta de tokens asegurada en:", SESSION_DIR);

let venomClient;
let qrCodeBase64 = null;

// Crear sesión Venom
venom
  .create(
    SESSION_NAME,
    (base64Qr) => {
      qrCodeBase64 = base64Qr;

      // Guardar QR como imagen
      const matches = base64Qr.match(/^data:image\/png;base64,(.+)$/);
      if (matches) {
        const buffer = Buffer.from(matches[1], "base64");
        fs.writeFileSync(QR_PATH, buffer, "binary");
        console.log("✅ QR guardado en:", QR_PATH);
      }
      console.log("✅ QR recibido, disponible en /qr");
    },
    undefined,
    {
      headless: true,
      logQR: false,
      browserPathExecutable: process.env.CHROME_PATH || "/usr/bin/chromium",
      browserArgs: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
      mkdirFolderToken: VENOM_TOKENS_PATH,
      folderNameToken: SESSION_NAME,
    }
  )
  .then((client) => {
    venomClient = client;
    console.log("🤖 Venom iniciado correctamente");

    // Ejemplo de respuesta automática
    client.onMessage((message) => {
      console.log(`📩 Mensaje recibido: ${message.body} de ${message.from}`);
      if (message.body.toLowerCase() === "hola") {
        client.sendText(message.from, "👋 Hola, bot funcionando!").catch(console.error);
      }
    });
  })
  .catch((err) => console.error("❌ Error iniciando Venom:", err));

// Endpoints
app.get("/", (req, res) => res.send("Venom BOT corriendo en Railway 🚀"));

app.get("/qr", (req, res) => {
  if (!qrCodeBase64) return res.send("⚡ QR aún no generado. Recarga en unos segundos...");
  res.send(`
    <html>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;">
        <h2>Escanea el QR con WhatsApp 📱</h2>
        <img src="${qrCodeBase64}" />
      </body>
    </html>
  `);
});

app.get("/status", (req, res) => {
  if (venomClient && venomClient.isConnected()) {
    res.json({ status: "logged", message: "Cliente WhatsApp conectado ✅" });
  } else {
    res.json({ status: "not_logged", message: "Cliente esperando QR o no iniciado ❌" });
  }
});

app.post("/send-message", async (req, res) => {
  if (!venomClient) return res.status(400).json({ error: "Bot no iniciado" });

  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: "Faltan parámetros 'to' o 'message'" });

  try {
    await venomClient.sendText(to, message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Servidor escuchando en puerto ${PORT}`));
