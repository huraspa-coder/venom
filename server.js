// server.js — Venom + Botpress Chat API
const express = require("express");
const venom = require("venom-bot");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

// ====== Variables de entorno ======
const PORT = process.env.PORT || 3000;
const SESSION_NAME = process.env.SESSION_NAME || "venom-session";
const VENOM_TOKENS_PATH = process.env.VENOM_TOKENS_PATH || "/data/tokens";
const CHROME_PATH = process.env.CHROME_PATH || undefined;

// Botpress Chat API
const BOTPRESS_WEBHOOK_ID = process.env.BOTPRESS_WEBHOOK_ID || ""; // ej: bf9295f7-...
const BOTPRESS_API_KEY = process.env.BOTPRESS_API_KEY || "";       // Encryption Key (HS256)
const BOTPRESS_WEBHOOK_SECRET = process.env.BOTPRESS_WEBHOOK_SECRET || ""; // opcional
const CHAT_BASE = "https://chat.botpress.cloud";

// ====== Asegurar carpetas y paths ======
fs.mkdirSync(VENOM_TOKENS_PATH, { recursive: true });
console.log("📂 Carpeta de tokens asegurada en:", VENOM_TOKENS_PATH);

// Archivo para mapear ids (persistente)
const MAPPINGS_FILE = path.join(VENOM_TOKENS_PATH, "bp_mappings.json");

// Cargar mappings de disco (si existen)
let bpMappings = {};
try {
  if (fs.existsSync(MAPPINGS_FILE)) {
    const raw = fs.readFileSync(MAPPINGS_FILE, "utf8");
    bpMappings = JSON.parse(raw || "{}");
  }
} catch (e) {
  console.error("⚠️ Error cargando bp_mappings.json:", e.message);
  bpMappings = {};
}
function saveMappings() {
  try {
    fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(bpMappings, null, 2));
  } catch (e) {
    console.error("⚠️ Error escribiendo bp_mappings.json:", e.message);
  }
}

// ====== Helpers ======
// Sanear ID para Botpress (solo permitir letras, números, guión y subrayado)
const sanitizeId = (id = "") => String(id).replace(/[^a-zA-Z0-9-_]/g, "_");

// Convertir botpressId a JID (usar mapping si existe)
const botpressIdToJid = (botpressId) => {
  if (!botpressId) return null;
  // Si en mapping tenemos el jid original, devolverlo
  if (bpMappings[botpressId]) return bpMappings[botpressId];
  // Si ya parece un JID, devolverlo
  if (/@c\.us$/.test(botpressId)) return botpressId;
  // No conocemos el mapping -> null
  return null;
};

// Guardar mapping seguro
const rememberMapping = (botpressId, jid) => {
  if (!botpressId || !jid) return;
  bpMappings[botpressId] = jid;
  saveMappings();
};

// ====== Variables runtime ======
let qrCodeBase64 = null;
let venomClient = null;

// ====== Iniciar Venom ======
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
      try {
        const from = message.from; // ej: 569XXXXXXXX@c.us
        const text = message?.body ?? "";
        console.log(`📩 Mensaje recibido: ${text} de ${from}`);

        // Respuesta local rápida (opcional)
        if (text.toLowerCase() === "hola") {
          client.sendText(from, "¡Hola! Bot conectado 🚀").catch(console.error);
        }

        // Si Botpress no está configurado, no intentamos enviar
        if (!BOTPRESS_WEBHOOK_ID || !BOTPRESS_API_KEY) return;

        // Sanear id que usaremos en Botpress
        const bpUserId = sanitizeId(from);
        // Recordar mapping para poder convertir respuestas de Botpress -> JID real
        rememberMapping(bpUserId, from);

        // Firmar x-user-key con el id saneado
        const xUserKey = jwt.sign({ id: bpUserId }, BOTPRESS_API_KEY, { algorithm: "HS256" });

        // 1) getOrCreateUser
        await axios.post(
          `${CHAT_BASE}/${BOTPRESS_WEBHOOK_ID}/users/get-or-create`,
          { id: bpUserId },
          { headers: { "x-user-key": xUserKey }, timeout: 10000 }
        );

        // 2) getOrCreateConversation
        const convRes = await axios.post(
          `${CHAT_BASE}/${BOTPRESS_WEBHOOK_ID}/conversations/get-or-create`,
          { id: bpUserId },
          { headers: { "x-user-key": xUserKey }, timeout: 10000 }
        );
        // conversation id que usa Botpress (ya debe ser seguro)
        const convIdRaw = convRes.data?.conversation?.id || convRes.data?.id || bpUserId;
        const conversationId = sanitizeId(convIdRaw);

        // 3) Enviar mensaje a Botpress (usar payload)
        await axios.post(
          `${CHAT_BASE}/${BOTPRESS_WEBHOOK_ID}/messages`,
          {
            conversationId,
            payload: { type: "text", text },
          },
          { headers: { "x-user-key": xUserKey }, timeout: 10000 }
        );

        console.log("✅ Mensaje enviado a Botpress Chat API (user/conversation):", bpUserId, conversationId);
      } catch (err) {
        const detail = err.response?.data || err.message || err;
        console.error("❌ Error enviando a Botpress:", detail);
      }
    });
  })
  .catch((err) => console.error("❌ Error iniciando Venom:", err));

// ====== Endpoints públicos ======

// QR (página simple)
app.get("/qr", (req, res) => {
  if (!qrCodeBase64) return res.send("⚡ QR aún no generado. Revisa los logs.");
  res.send(`
    <html>
      <body style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;">
        <h3>Escanea el QR con WhatsApp</h3>
        <img src="${qrCodeBase64}" />
      </body>
    </html>
  `);
});

// Healthcheck
app.get("/", (_req, res) => res.send("Venom BOT corriendo 🚀"));

// Status
app.get("/status", (_req, res) => {
  res.json({
    venom: !!venomClient,
    session: SESSION_NAME,
    tokensPath: VENOM_TOKENS_PATH,
    mappingsFile: MAPPINGS_FILE,
  });
});

// Enviar mensaje manual (Postman)
app.post("/send-message", async (req, res) => {
  try {
    if (!venomClient) return res.status(400).json({ error: "Bot no iniciado" });
    const { to, message } = req.body;
    if (!to || !message) return res.status(400).json({ error: "Faltan 'to' y/o 'message'" });
    const jid = to.endsWith("@c.us") ? to : `${to}@c.us`;
    await venomClient.sendText(jid, message);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || err });
  }
});

// Webhook que Botpress llama para enviar respuestas hacia WhatsApp
app.post("/botpress/response", async (req, res) => {
  try {
    // Validar secret si lo configuraste
    if (BOTPRESS_WEBHOOK_SECRET) {
      const secret = req.headers["x-webhook-secret"] || req.headers["x-secret"] || "";
      if (secret !== BOTPRESS_WEBHOOK_SECRET) {
        return res.status(401).json({ error: "Invalid webhook secret" });
      }
    }

    const body = req.body || {};
    // Intentar extraer conversationId y texto de varias formas posibles
    const conversationIdRaw =
      body.conversationId || body?.conversation?.id || body?.payload?.conversationId || body?.payload?.conversation?.id;
    const text =
      body?.payload?.text ||
      body?.payload?.message?.text ||
      body?.message?.text ||
      body?.text ||
      (body?.payload && body.payload?.message && body.payload.message?.text);

    if (!conversationIdRaw) {
      console.log("⚠️ /botpress/response sin conversationId:", body);
      return res.json({ received: true, forwarded: false, reason: "no_conversationId" });
    }

    if (!text) {
      console.log("⚠️ /botpress/response sin texto:", body);
      return res.json({ received: true, forwarded: false, reason: "no_text" });
    }

    // conversationId que Botpress nos manda habitualmente es el sanitized id que usamos
    const conversationId = sanitizeId(String(conversationIdRaw));
    // Buscar JID original en mappings
    let jid = botpressIdToJid(conversationId);

    // Si no está en mappings, quizá Botpress envió el JID directo
    if (!jid && /@c\.us$/.test(conversationIdRaw)) {
      jid = conversationIdRaw;
    }

    if (!jid) {
      console.log("⚠️ No se encontró mapping para conversationId:", conversationId, "body:", body);
      return res.json({ received: true, forwarded: false, reason: "no_mapping" });
    }

    if (!venomClient) {
      console.log("⚠️ Venom no iniciado, no se puede reenviar:", jid, text);
      return res.status(500).json({ received: true, forwarded: false, reason: "venom_not_ready" });
    }

    await venomClient.sendText(jid, String(text));
    console.log("✅ Webhook Botpress -> mensaje reenviado a WhatsApp:", jid, text);
    return res.json({ received: true, forwarded: true });
  } catch (err) {
    console.error("❌ Error en /botpress/response:", err.response?.data || err.message || err);
    return res.status(500).json({ error: err.message || err });
  }
});

// Iniciar servidor HTTP
app.listen(PORT, () => console.log(`✅ Servidor escuchando en puerto ${PORT}`));
