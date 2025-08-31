const express = require("express");
const venom = require("venom-bot");
const fs = require("fs");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

// ====== Variables de entorno ======
const PORT = process.env.PORT || 3000;
const SESSION_NAME = process.env.SESSION_NAME || "venom-session";
const VENOM_TOKENS_PATH = process.env.VENOM_TOKENS_PATH || "/data/tokens";
const CHROME_PATH = process.env.CHROME_PATH || undefined;

// Chat API (Botpress)
const BOTPRESS_WEBHOOK_ID = process.env.BOTPRESS_WEBHOOK_ID || ""; // ID de la integración Chat
const BOTPRESS_API_KEY = process.env.BOTPRESS_API_KEY || "";        // Encryption Key HS256
const BOTPRESS_WEBHOOK_SECRET = process.env.BOTPRESS_WEBHOOK_SECRET || "";
const CHAT_BASE = "https://chat.botpress.cloud";

// ====== Persistencia ======
fs.mkdirSync(VENOM_TOKENS_PATH, { recursive: true });
console.log("📂 Carpeta de tokens asegurada en:", VENOM_TOKENS_PATH);

let qrCodeBase64 = null;
let venomClient = null;

// ====== Venom ======
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
      const from = message.from;
      const text = message?.body ?? "";

      console.log(`📩 Mensaje recibido: ${text} de ${from}`);

      // Respuesta local simple
      if (text.toLowerCase() === "hola") {
        client.sendText(from, "¡Hola! Bot conectado 🚀").catch(console.error);
      }

      // Enviar mensaje a Botpress Chat API
      if (!BOTPRESS_WEBHOOK_ID || !BOTPRESS_API_KEY) return;

      try {
        const userId = from;
        const xUserKey = jwt.sign({ id: userId }, BOTPRESS_API_KEY, { algorithm: "HS256" });

        // 1) Obtener o crear usuario en Chat API
        await axios.post(
          `${CHAT_BASE}/${BOTPRESS_WEBHOOK_ID}/getOrCreateUser`,
          { id: userId },
          { headers: { "x-user-key": xUserKey } }
        );

        // 2) Obtener o crear conversación
        const convRes = await axios.post(
          `${CHAT_BASE}/${BOTPRESS_WEBHOOK_ID}/getOrCreateConversation`,
          { userId },
          { headers: { "x-user-key": xUserKey } }
        );
        const conversationId = convRes.data?.conversation?.id || convRes.data?.id || userId;

        // 3) Enviar mensaje a Botpress (formato correcto)
        await axios.post(
          `${CHAT_BASE}/${BOTPRESS_WEBHOOK_ID}/createMessage`,
          {
            conversationId,
            message: { type: "text", text },
          },
          { headers: { "x-user-key": xUserKey } }
        );

        console.log("✅ Mensaje enviado a Botpress Chat API");
      } catch (err) {
        const detail = err.response?.data || err.message;
        console.error("❌ Error enviando a Botpress:", detail);
      }
    });
  })
  .catch((err) => console.error("❌ Error iniciando Venom:", err));

// ====== Endpoints ======

// QR embebido
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
app.get("/", (_req, res) => res.send("Venom BOT corriendo en Railway 🚀"));

// Estado simple
app.get("/status", (_req, res) => {
  res.json({
    venom: !!venomClient,
    session: SESSION_NAME,
    tokensPath: VENOM_TOKENS_PATH,
  });
});

// Enviar mensaje vía Postman
app.post("/send-message", async (req, res) => {
  try {
    if (!venomClient) return res.status(400).json({ error: "Bot no iniciado" });
    const { to, message } = req.body;
    if (!to || !message) return res.status(400).json({ error: "Faltan 'to' y/o 'message'" });

    const jid = to.endsWith("@c.us") ? to : `${to}@c.us`;
    await venomClient.sendText(jid, message);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Webhook Botpress → WhatsApp
app.post("/botpress/response", async (req, res) => {
  try {
    if (BOTPRESS_WEBHOOK_SECRET) {
      const secret = req.headers["x-webhook-secret"] || req.headers["x-secret"] || "";
      if (secret !== BOTPRESS_WEBHOOK_SECRET) {
        return res.status(401).json({ error: "Invalid webhook secret" });
      }
    }

    const body = req.body || {};
    const conversationId =
      body.conversationId || body?.conversation?.id || body?.payload?.conversationId;
    const text = body?.message?.text || body?.payload?.message?.text || body?.text;

    if (!venomClient || !conversationId || !text) {
      return res.json({ received: true, forwarded: false });
    }

    const jid = conversationId.endsWith("@c.us") ? conversationId : `${conversationId}@c.us`;
    await venomClient.sendText(jid, text);
    return res.json({ received: true, forwarded: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Servidor escuchando en puerto ${PORT}`));
