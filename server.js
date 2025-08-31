const express = require("express");
const venom = require("venom-bot");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
app.use(express.json());

// Variables de entorno
const PORT = process.env.PORT || 3000;
const SESSION_NAME = process.env.SESSION_NAME || "venom-session";
const VENOM_TOKENS_PATH = process.env.VENOM_TOKENS_PATH || "/data/tokens";
const BOTPRESS_API_KEY = process.env.BOTPRESS_API_KEY || "123456";
const BOTPRESS_WEBHOOK_URL = process.env.BOTPRESS_WEBHOOK_URL || "";
const WHATSAPP_DEFAULT_NUMBER = process.env.WHATSAPP_DEFAULT_NUMBER || "";
const CHROME_PATH = process.env.CHROME_PATH || "/usr/bin/chromium";

// Asegurar carpeta de tokens
fs.mkdirSync(VENOM_TOKENS_PATH, { recursive: true });
console.log("📂 Carpeta de tokens asegurada en:", VENOM_TOKENS_PATH);

let qrCodeBase64 = null;
let venomClient = null;

// Iniciar Venom
venom
  .create({
    session: SESSION_NAME,
    multidevice: true,
    headless: true,
    folderNameToken: VENOM_TOKENS_PATH,
    mkdirFolderToken: VENOM_TOKENS_PATH,
    logQR: false,
    catchQR: (base64Qr) => {
      qrCodeBase64 = base64Qr;
      console.log("✅ QR recibido, disponible en /qr");
    },
    browserPathExecutable: CHROME_PATH,
  })
  .then((client) => {
    venomClient = client;
    console.log("🤖 Venom iniciado correctamente");

    client.onMessage(async (message) => {
      console.log(`📩 Mensaje recibido: ${message.body} de ${message.from}`);

      // Respuesta automática simple
      if (message.body && message.body.toLowerCase() === "hola") {
        await client.sendText(message.from, "¡Hola! Bot conectado 🚀").catch(console.error);
      }

      // Enviar mensaje a Botpress si está configurado
      if (BOTPRESS_WEBHOOK_URL && message.body) {
        try {
          await axios.post(
            BOTPRESS_WEBHOOK_URL,
            {
              type: "text",
              text: message.body,
              user: message.from
            },
            {
              headers: { Authorization: `Bearer ${BOTPRESS_API_KEY}` }
            }
          );
          console.log("✅ Mensaje enviado a Botpress");
        } catch (err) {
          console.error("❌ Error enviando a Botpress:", err.message);
        }
      }
    });
  })
  .catch((err) => console.error("❌ Error iniciando Venom:", err));

// Endpoints

// Mostrar QR
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

// Healthcheck
app.get("/", (req, res) => res.send("Venom BOT corriendo en Railway 🚀"));

// Enviar mensaje
app.post("/send-message", async (req, res) => {
  if (!venomClient) return res.status(400).json({ error: "Bot no iniciado" });

  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: "Faltan parámetros 'to' o 'message'" });

  try {
    await venomClient.sendText(to.includes("@c.us") ? to : to + "@c.us", message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Servidor escuchando en puerto ${PORT}`));
