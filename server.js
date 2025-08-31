const express = require("express");
const venom = require("venom-bot");
const fs = require("fs");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

// Variables de entorno
const PORT = process.env.PORT || 3000;
const SESSION_NAME = process.env.SESSION_NAME || "venom-session";
const VENOM_TOKENS_PATH = process.env.VENOM_TOKENS_PATH || "/data/tokens";
const BOTPRESS_API_KEY = process.env.BOTPRESS_API_KEY || "";
const BOTPRESS_WEBHOOK_ID = process.env.BOTPRESS_WEBHOOK_URL || ""; // Solo ID de Chat API
const WHATSAPP_DEFAULT_NUMBER = process.env.WHATSAPP_DEFAULT_NUMBER || "";
const CHROME_PATH = process.env.CHROME_PATH || undefined;

// Asegurar carpeta de tokens
fs.mkdirSync(VENOM_TOKENS_PATH, { recursive: true });

// Variables globales
let qrCodeBase64 = null;
let venomClient = null;

// Función para generar x-user-key para Chat API
function generateXUserKey(userId) {
  return jwt.sign({ id: userId }, BOTPRESS_API_KEY, { algorithm: "HS256" });
}

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
      if (message.body.toLowerCase() === "hola") {
        await client.sendText(message.from, "¡Hola! Bot conectado 🚀").catch(console.error);
      }

      // Enviar mensaje a Botpress Chat API
      if (BOTPRESS_WEBHOOK_ID) {
        try {
          const xUserKey = generateXUserKey("venom_user_" + message.from);
          
          // Crear conversación
          const convResp = await axios.post(
            `https://chat.botpress.cloud/${BOTPRESS_WEBHOOK_ID}/createConversation`,
            {},
            { headers: { "x-user-key": xUserKey } }
          );

          const conversationId = convResp.data.id;

          // Enviar mensaje a la conversación
          await axios.post(
            `https://chat.botpress.cloud/${BOTPRESS_WEBHOOK_ID}/createMessage`,
            {
              conversationId,
              type: "text",
              text: message.body,
            },
            { headers: { "x-user-key": xUserKey } }
          );

          console.log("✅ Mensaje enviado a Botpress Chat API");
        } catch (err) {
          console.error("❌ Error enviando a Botpress:", err.response?.data || err.message);
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
app.get("/", (req, res) => res.send("Venom BOT corriendo 🚀"));

// Enviar mensaje desde Postman
app.post("/send-message", async (req, res) => {
  if (!venomClient) return res.status(400).json({ error: "Bot no iniciado" });

  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: "Faltan parámetros 'to' o 'message'" });

  try {
    await venomClient.sendText(to + "@c.us", message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Servidor escuchando en puerto ${PORT}`));
