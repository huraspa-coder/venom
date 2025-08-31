const express = require("express");
const venom = require("venom-bot");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

// Variables de entorno
const PORT = process.env.PORT || 3000;
const SESSION_NAME = process.env.SESSION_NAME || "venom-session";
const VENOM_TOKENS_PATH = process.env.VENOM_TOKENS_PATH || "/data/tokens";
const BOTPRESS_API_KEY = process.env.BOTPRESS_API_KEY || "123456";
const BOTPRESS_WEBHOOK_URL = process.env.BOTPRESS_WEBHOOK_URL || "";
const WHATSAPP_DEFAULT_NUMBER = process.env.WHATSAPP_DEFAULT_NUMBER || "";
const CHAT_API_USER_ID = process.env.CHAT_API_USER_ID || "user1";
const CHAT_API_ENCRYPTION_KEY = process.env.CHAT_API_ENCRYPTION_KEY || "u7rR8tP9XwZ1gH3vQ2mY9jKc6ab5nTz4xE8qF1s0dVwR3yU2pOqNzWmXyZk==";
const CHAT_API_BASE_URL = process.env.CHAT_API_BASE_URL || "https://chat.botpress.cloud";

// Carpeta persistente
fs.mkdirSync(VENOM_TOKENS_PATH, { recursive: true });
console.log("📂 Carpeta de tokens asegurada en:", VENOM_TOKENS_PATH);

let qrCodeBase64 = null;
let venomClient = null;

// Generar x-user-key JWT para Chat API
function generateUserKey() {
  return jwt.sign({ id: CHAT_API_USER_ID }, CHAT_API_ENCRYPTION_KEY, { algorithm: "HS256" });
}

// Función para enviar mensaje a Botpress Chat API
async function sendToBotpress(message, from) {
  try {
    const userKey = generateUserKey();
    
    // Primero obtenemos o creamos el usuario y conversation
    const userResp = await axios.post(`${CHAT_API_BASE_URL}/getOrCreateUser`, { id: CHAT_API_USER_ID }, { headers: { "x-user-key": userKey } });
    const userKeyResp = userResp.data.userKey;
    
    const convResp = await axios.post(`${CHAT_API_BASE_URL}/createConversation`, {}, { headers: { "x-user-key": userKeyResp } });
    const conversationId = convResp.data.id;
    
    // Enviar mensaje
    await axios.post(
      `${CHAT_API_BASE_URL}/createMessage`,
      { type: "text", text: message },
      { headers: { "x-user-key": userKeyResp, "Content-Type": "application/json" } }
    );
    
    console.log("✅ Mensaje enviado a Botpress Chat API");
  } catch (err) {
    console.error("❌ Error enviando a Botpress:", err.response?.data || err.message);
  }
}

// Iniciar Venom
venom.create({
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
  browserPathExecutable: process.env.CHROME_PATH || undefined
})
.then(client => {
  venomClient = client;
  console.log("🤖 Venom iniciado correctamente");

  client.onMessage(message => {
    console.log(`📩 Mensaje recibido: ${message.body} de ${message.from}`);

    // Respuesta simple
    if (message.body.toLowerCase() === "hola") {
      client.sendText(message.from, "¡Hola! Bot conectado 🚀").catch(console.error);
    }

    // Enviar a Botpress Chat API
    if (BOTPRESS_WEBHOOK_URL) sendToBotpress(message.body, message.from);
  });
})
.catch(err => console.error("❌ Error iniciando Venom:", err));

// Endpoints
app.get("/qr", (req, res) => {
  if (!qrCodeBase64) return res.send("⚡ QR aún no generado...");
  res.send(`<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;">
    <h2>Escanea el QR con WhatsApp 📱</h2>
    <img src="${qrCodeBase64}" />
  </body></html>`);
});

app.get("/", (req, res) => res.send("Venom BOT corriendo 🚀"));

app.post("/send-message", (req, res) => {
  if (!venomClient) return res.status(400).json({ error: "Bot no iniciado" });
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: "Faltan 'to' o 'message'" });

  venomClient.sendText(to + "@c.us", message)
    .then(() => res.json({ success: true }))
    .catch(err => res.status(500).json({ error: err.message }));
});

app.listen(PORT, () => console.log(`✅ Servidor escuchando en puerto ${PORT}`));
