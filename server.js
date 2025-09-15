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
const BOTPRESS_WEBHOOK_ID = process.env.BOTPRESS_WEBHOOK_ID || "";
const BOTPRESS_API_KEY = process.env.BOTPRESS_API_KEY || "";
const BOTPRESS_WEBHOOK_SECRET = process.env.BOTPRESS_WEBHOOK_SECRET || "";
const CHAT_BASE = "https://chat.botpress.cloud";

// ====== Asegurar carpetas ======
fs.mkdirSync(VENOM_TOKENS_PATH, { recursive: true });
console.log("📂 Carpeta de tokens asegurada en:", VENOM_TOKENS_PATH);

const MAPPINGS_FILE = path.join(VENOM_TOKENS_PATH, "bp_mappings.json");

// Cargar mappings
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
const sanitizeId = (id = "") => String(id).replace(/[^a-zA-Z0-9-_]/g, "_");

const botpressIdToJid = (botpressId) => {
  if (!botpressId) return null;
  if (bpMappings[botpressId]) return bpMappings[botpressId];
  if (/@c\.us$/.test(botpressId)) return botpressId;
  return null;
};

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
        const from = message.from;
        const text = message?.body ?? "";
        console.log(`📩 Mensaje recibido: ${text} de ${from}`);

        if (text.toLowerCase() === "hola") {
          client.sendText(from, "¡Hola! Bot conectado 🚀").catch(console.error);
        }

        if (!BOTPRESS_WEBHOOK_ID || !BOTPRESS_API_KEY) return;

        const bpUserId = sanitizeId(from);
        rememberMapping(bpUserId, from);

        const xUserKey = jwt.sign({ id: bpUserId }, BOTPRESS_API_KEY, { algorithm: "HS256" });

        await axios.post(
          `${CHAT_BASE}/${BOTPRESS_WEBHOOK_ID}/users/get-or-create`,
          { id: bpUserId },
          { headers: { "x-user-key": xUserKey }, timeout: 10000 }
        );

        const convRes = await axios.post(
          `${CHAT_BASE}/${BOTPRESS_WEBHOOK_ID}/conversations/get-or-create`,
          { id: bpUserId },
          { headers: { "x-user-key": xUserKey }, timeout: 10000 }
        );

        const convIdRaw = convRes.data?.conversation?.id || convRes.data?.id || bpUserId;
        const conversationId = sanitizeId(convIdRaw);

        await axios.post(
          `${CHAT_BASE}/${BOTPRESS_WEBHOOK_ID}/messages`,
          {
            conversationId,
            payload: { type: "text", text },
          },
          { headers: { "x-user-key": xUserKey }, timeout: 10000 }
        );

        console.log("✅ Mensaje enviado a Botpress Chat API:", bpUserId, conversationId);
      } catch (err) {
        const detail = err.response?.data || err.message || err;
        console.error("❌ Error enviando a Botpress:", detail);
      }
    });
  })
  .catch((err) => console.error("❌ Error iniciando Venom:", err));

// ====== Endpoints ======

// QR con estilo similar a WhatsApp Web
app.get("/qr", (req, res) => {
  if (!qrCodeBase64) return res.send("⚡ QR aún no generado. Revisa los logs.");

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>WhatsApp Web - Conectar</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #efeae2;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
        }
        .container {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          text-align: center;
          max-width: 400px;
        }
        .steps {
          text-align: left;
          margin: 20px 0;
        }
        .steps ol {
          padding-left: 20px;
        }
        img {
          margin-top: 10px;
          width: 250px;
          height: 250px;
        }
        .footer {
          margin-top: 15px;
          font-size: 12px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Pasos para iniciar sesión</h2>
        <div class="steps">
          <ol>
            <li>Abre WhatsApp en tu teléfono.</li>
            <li>En Android, toca Menú ⋮. En iPhone, toca Ajustes ⚙️.</li>
            <li>Toca <b>Dispositivos vinculados</b> y luego <b>Vincular dispositivo</b>.</li>
            <li>Escanea el código QR para confirmar.</li>
          </ol>
        </div>
        <img src="${qrCodeBase64}" alt="Código QR de WhatsApp" />
        <div class="footer">
          Tus mensajes personales están cifrados de extremo a extremo.
        </div>
      </div>
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

// Enviar mensaje manual
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

// Webhook Botpress -> WhatsApp
app.post("/botpress/response", async (req, res) => {
  try {
    if (BOTPRESS_WEBHOOK_SECRET) {
      const secret = req.headers["x-webhook-secret"] || req.headers["x-secret"] || "";
      if (secret !== BOTPRESS_WEBHOOK_SECRET) {
        return res.status(401).json({ error: "Invalid webhook secret" });
      }
    }

    const body = req.body || {};
    const conversationIdRaw =
      body.conversationId || body?.conversation?.id || body?.payload?.conversationId || body?.payload?.conversation?.id;
    const text =
      body?.payload?.text ||
      body?.payload?.message?.text ||
      body?.message?.text ||
      body?.text;

    if (!conversationIdRaw) {
      console.log("⚠️ /botpress/response sin conversationId:", body);
      return res.json({ received: true, forwarded: false, reason: "no_conversationId" });
    }

    if (!text) {
      console.log("⚠️ /botpress/response sin texto:", body);
      return res.json({ received: true, forwarded: false, reason: "no_text" });
    }

    const conversationId = sanitizeId(String(conversationIdRaw));
    let jid = botpressIdToJid(conversationId);

    if (!jid && /@c\.us$/.test(conversationIdRaw)) {
      jid = conversationIdRaw;
    }

    if (!jid) {
      console.log("⚠️ No se encontró mapping para conversationId:", conversationId);
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

// Iniciar servidor
app.listen(PORT, () => console.log(`✅ Servidor escuchando en puerto ${PORT}`));
