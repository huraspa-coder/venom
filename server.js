// server.js — Venom <-> Railway (robusto y con QR visible)
const express = require("express");
const venom = require("venom-bot");
const fs = require("fs");

const app = express();
app.use(express.json());

let lastQr = null;

// 🔹 Ruta de tokens en Railway
const SESSION_PATH = "/data/tokens/venom-session";

// 🔹 Si hay sesión corrupta, borrarla antes de iniciar
if (fs.existsSync(SESSION_PATH)) {
  try {
    fs.rmSync(SESSION_PATH, { recursive: true, force: true });
    console.log("⚡ Sesión anterior borrada. Se pedirá nuevo QR.");
  } catch (err) {
    console.error("❌ Error borrando sesión previa:", err);
  }
}

// 🔹 Iniciar Venom
venom
  .create(
    {
      session: "venom-session",
      headless: true,
      useChrome: true,
      executablePath: "/usr/bin/chromium",
      browserArgs: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-gpu",
      ],
      disableWelcome: true,
    },
    (base64Qr) => {
      lastQr = base64Qr;
      console.log("⚡ Nuevo QR generado, escanéalo en /qr");
    }
  )
  .then((client) => startBot(client))
  .catch((err) => console.error("❌ Error al iniciar Venom:", err));

// 🔹 Lógica del bot
function startBot(client) {
  console.log("🤖 Venom iniciado correctamente");

  client.onMessage((message) => {
    if (message.body === "ping") {
      client.sendText(message.from, "pong 🏓");
    }
  });
}

// 🔹 Endpoint para mostrar el QR
app.get("/qr", (req, res) => {
  if (!lastQr) {
    return res.send(`
      <html>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;font-family:sans-serif;">
          <h2>⚡ QR aún no generado. Revisa los logs.</h2>
          <p>Si ya estabas conectado, no verás QR porque la sesión sigue activa.</p>
        </body>
      </html>
    `);
  }

  res.send(`
    <html>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;font-family:sans-serif;">
        <h2>Escanea este QR con WhatsApp</h2>
        <img src="${lastQr}" style="width:300px;height:300px;border:8px solid #000;border-radius:12px;"/>
        <p>Abre WhatsApp → Menú → Dispositivos vinculados → Escanear QR</p>
      </body>
    </html>
  `);
});

// 🔹 Servidor Express
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});
