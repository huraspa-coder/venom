// server.js — Venom <-> Botpress Chat API (robusto, persistente, compatible)
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

// Botpress Chat API (ajusta en Railway)
const BOTPRESS_WEBHOOK_ID = process.env.BOTPRESS_WEBHOOK_ID || ""; // ej: bf9295f7-...
const BOTPRESS_API_KEY = process.env.BOTPRESS_API_KEY || "";       // Encryption Key HS256
const BOTPRESS_WEBHOOK_SECRET = process.env.BOTPRESS_WEBHOOK_SECRET || ""; // opcional
const CHAT_BASE = "https://chat.botpress.cloud";

// ====== Archivos / persistencia ======
fs.mkdirSync(VENOM_TOKENS_PATH, { recursive: true });
console.log("📂 Carpeta de tokens asegurada en:", VENOM_TOKENS_PATH);

const MAPPINGS_FILE = path.join(VENOM_TOKENS_PATH, "bp_mappings.json");

// cargar mappings guardados (botpressId -> jid original)
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
// Sanitize ID: mantener solo chars seguros para Botpress (letras, números, - y _)
const sanitizeId = (id = "") => String(id).replace(/[^a-zA-Z0-9\-_]/g, "_");

// Normalizar JID -> id para Botpress (sanitizado)
const jidToBpId = (jid) => sanitizeId(jid);

// Guardar mapping botpressId -> jid
const rememberMapping = (botpressId, jid) => {
  if (!botpressId || !jid) return;
  bpMappings[botpressId] = jid;
  saveMappings();
};

// Buscar JID a partir de botpressId (mappings o heurísticas)
const botpressIdToJid = (bpId) => {
  if (!bpId) return null;
  if (bpMappings[bpId]) return bpMappings[bpId];
  // Heurística: si termina con _c_us -> convertir a @c.us
  if (/_c_us$/.test(bpId)) {
    return bpId.replace(/_c_us$/, "@c.us");
  }
  // Heurística (fallback): si sólo contine dígitos y guiones/underscores, intentar reconstruir
  const digitsMatch = bpId.match(/^(\d+)[-_]/);
  if (digitsMatch) {
    return bpId.replace(/[-_]/g, "@"); // menos probable, se intenta como último recurso
  }
  return null;
};

// Intento de envío a Botpress: prueba payload primero, si falla intenta message (compatibilidad)
async function sendToBotpressAndEnsure(bpUserId, text) {
  const normalized = sanitizeId(bpUserId);
  const xUserKey = jwt.sign({ id: normalized }, BOTPRESS_API_KEY, { algorithm: "HS256" });

  // 1) getOrCreateUser
  await axios.post(
    `${CHAT_BASE}/${BOTPRESS_WEBHOOK_ID}/users/get-or-create`,
    { id: normalized },
    { headers: { "x-user-key": xUserKey }, timeout: 10000 }
  );

  // 2) getOrCreateConversation
  const convRes = await axios.post(
    `${CHAT_BASE}/${BOTPRESS_WEBHOOK_ID}/conversations/get-or-create`,
    { id: normalized },
    { headers: { "x-user-key": xUserKey }, timeout: 10000 }
  );
  const convIdRaw = convRes.data?.conversation?.id || convRes.data?.id || normalized;
  const conversationId = sanitizeId(convIdRaw);

  // recordar mapping (conversationId -> jid) lo hará el caller si tiene jid, aquí retornamos conv id
  // 3) enviar mensaje: intentar con { payload: { type, text } } (formato que falló antes)
  try {
    const bodyPayload = {
      conversationId,
      payload: { type: "text", text },
    };
    const res = await axios.post(
      `${CHAT_BASE}/${BOTPRESS_WEBHOOK_ID}/messages`,
      bodyPayload,
      { headers: { "x-user-key": xUserKey }, timeout: 10000 }
    );
    return { conversationId, resData: res.data };
  } catch (err) {
    // si responde con error relacionado a payload, reintentar con "message"
    const detail = err.response?.data || err.message || "";
    const msg = typeof detail === "object" ? JSON.stringify(detail) : String(detail);
    // detectar si es error por falta de payload / invalid payload
    if (msg.includes("must have required property 'payload'") || msg.includes("InvalidPayload") || msg.includes("payload")) {
      try {
        const bodyMsg = {
          conversationId,
          message: { type: "text", text },
        };
        const res2 = await axios.post(
          `${CHAT_BASE}/${BOTPRESS_WEBHOOK_ID}/messages`,
          bodyMsg,
          { headers: { "x-user-key": xUserKey }, timeout: 10000 }
        );
        return { conversationId, resData: res2.data };
      } catch (err2) {
        throw err2;
      }
    }
    throw err;
  }
}

// ====== Runtime ======
let qrCodeBase64 = null;
let venomClient = null;

// ====== Iniciar Venom (NO tocar persistencia) ======
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

        // Si no está configurado Botpress, salir
        if (!BOTPRESS_WEBHOOK_ID || !BOTPRESS_API_KEY) return;

        // Normalizamos y recordamos mapping
        const bpUserId = jidToBpId(from); // sanitized id
        rememberMapping(bpUserId, from);

        // Intentamos enviar a Botpress (con defensas internas)
        try {
          const { conversationId } = await sendToBotpressAndEnsure(bpUserId, String(text));
          // recordamos mapping conversación -> jid
          rememberMapping(conversationId, from);
          console.log("✅ Mensaje enviado a Botpress Chat API (user/conversation):", bpUserId, conversationId);
        } catch (err) {
          const detail = err.response?.data || err.message || err;
          console.error("❌ Error enviando a Botpress (sendToBotpress):", detail);
        }
      } catch (err) {
        console.error("❌ Error en onMessage:", err.message || err);
      }
    });
  })
  .catch((err) => console.error("❌ Error iniciando Venom:", err));

// ====== Endpoints públicos ======

// /qr -> muestra QR embebido
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

// Health
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

// /send-message -> para Postman
app.post("/send-message", async (req, res) => {
  try {
    if (!venomClient) return res.status(400).json({ error: "Bot no iniciado" });
    const { to, message } = req.body;
    if (!to || !message) return res.status(400).json({ error: "Faltan 'to' y/o 'message'" });
    const jid = to.endsWith("@c.us") ? to : `${to}@c.us`;
    await venomClient.sendText(jid, String(message));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || err });
  }
});

// ====== Webhook Botpress -> Venom ======
// Botpress envía eventos (ej: message_created). Aceptamos varias estructuras y reenvíamos a WhatsApp.
app.post("/botpress/response", async (req, res) => {
  try {
    // Validar secret si se configuró
    if (BOTPRESS_WEBHOOK_SECRET) {
      const secret = req.headers["x-webhook-secret"] || req.headers["x-secret"] || "";
      if (secret !== BOTPRESS_WEBHOOK_SECRET) {
        return res.status(401).json({ error: "Invalid webhook secret" });
      }
    }

    const body = req.body || {};
    // Botpress a veces manda payload dentro de `data`
    const raw = body.data || body;

    // Extraer conversationId usando variantes
    const conversationIdRaw =
      raw.conversationId ||
      raw?.conversation?.id ||
      raw?.payload?.conversationId ||
      raw?.payload?.conversation?.id ||
      raw?.userId ||
      raw?.data?.conversationId ||
      raw?.data?.conversation?.id;

    // Extraer texto (varios formatos)
    const text =
      raw?.payload?.text ||
      raw?.payload?.message?.text ||
      raw?.message?.text ||
      raw?.text ||
      raw?.payload?.message?.payload?.text;

    if (!conversationIdRaw) {
      console.log("⚠️ /botpress/response sin conversationId:", JSON.stringify(body).slice(0, 200));
      return res.json({ received: true, forwarded: false, reason: "no_conversationId" });
    }
    if (!text) {
      console.log("⚠️ /botpress/response sin texto:", JSON.stringify(body).slice(0, 200));
      return res.json({ received: true, forwarded: false, reason: "no_text" });
    }

    // intentamos obtener jid desde mappings
    const sanitizedConvId = sanitizeId(String(conversationIdRaw));
    let jid = botpressIdToJid(sanitizedConvId);

    // heurística: si formulario común '123456789_c_us'
    if (!jid && /_c_us$/.test(String(conversationIdRaw))) {
      jid = String(conversationIdRaw).replace(/_c_us$/, "@c.us");
    }

    // fallback: si mapping no existe, ver si conversationIdRaw ya es JID
    if (!jid && /@c\.us$/.test(String(conversationIdRaw))) jid = conversationIdRaw;

    if (!jid) {
      console.log("⚠️ No se encontró mapping para conversationId:", conversationIdRaw);
      return res.json({ received: true, forwarded: false, reason: "no_mapping" });
    }

    if (!venomClient) {
      console.log("⚠️ Venom no iniciado (webhook), no puedo reenviar a:", jid);
      return res.status(500).json({ received: true, forwarded: false, reason: "venom_not_ready" });
    }

    // Enviar texto a WhatsApp
    await venomClient.sendText(jid, String(text));
    console.log("✅ Webhook Botpress -> WhatsApp reenviado:", jid, String(text));
    return res.json({ received: true, forwarded: true });
  } catch (err) {
    console.error("❌ Error en /botpress/response:", err.response?.data || err.message || err);
    return res.status(500).json({ error: err.message || err });
  }
});

app.listen(PORT, () => console.log(`✅ Servidor escuchando en puerto ${PORT}`));
