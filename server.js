const express = require("express");
const venom = require("venom-bot");
const axios = require("axios");

const app = express();
app.use(express.json());

// 🔑 Variables de entorno (Railway)
const BOTPRESS_API_URL = process.env.BOTPRESS_API_URL; // Ej: https://tu-botpress.railway.app
const BOTPRESS_BOT_ID = process.env.BOTPRESS_BOT_ID;   // ID del bot
const BOTPRESS_API_KEY = process.env.BOTPRESS_API_KEY; // Token de Botpress

// Persistencia de sesión
let client;

venom
  .create(
    "session-name",
    (base64Qr, asciiQR) => {
      console.log("⚡ Escanea este QR para iniciar sesión:");
      console.log(asciiQR);
    },
    undefined,
    { logQR: true, headless: true }
  )
  .then((venomClient) => {
    client = venomClient;
    console.log("🤖 Venom iniciado correctamente");

    // Manejo de mensajes entrantes
    client.onMessage(async (message) => {
      console.log(`📩 Mensaje recibido: ${message.body} de ${message.from}`);
      await sendToBotpress(message.body, message.from);
    });
  })
  .catch((err) => console.error("❌ Error iniciando Venom:", err));

/**
 * 🔗 Enviar mensaje a Botpress
 */
async function sendToBotpress(message, from) {
  try {
    const payload = {
      type: "text",  // 👈 Necesario para Botpress
      text: message, // Contenido del mensaje
      from: from     // Identificador del usuario
    };

    const response = await axios.post(
      `${BOTPRESS_API_URL}/api/v1/bots/${BOTPRESS_BOT_ID}/converse/${from}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${BOTPRESS_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Respuesta de Botpress:", response.data);

    // Si Botpress responde con texto, lo enviamos de vuelta al usuario
    if (response.data.responses && response.data.responses.length > 0) {
      for (const reply of response.data.responses) {
        if (reply.type === "text") {
          await client.sendText(from, reply.text);
        }
      }
    }
  } catch (err) {
    console.error(
      "❌ Error enviando a Botpress:",
      err.response?.data || err.message
    );
  }
}

// Endpoint de prueba
app.get("/", (req, res) => {
  res.send("✅ Server funcionando con Venom y Botpress");
});

// 🚀 Levantar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`⚡ Server escuchando en puerto ${PORT}`));
