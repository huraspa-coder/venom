const venom = require('venom-bot');
const express = require('express');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SESSION_NAME = process.env.SESSION_NAME || 'session-name';
const BOTPRESS_API_KEY = process.env.BOTPRESS_API_KEY;
const BOTPRESS_WEBHOOK_ID = process.env.BOTPRESS_WEBHOOK_ID;

// URL correcta de Chat API
const BOTPRESS_CHAT_API_BASE = "https://chat.botpress.cloud";

// 🔹 Iniciar Venom
venom.create({
  session: SESSION_NAME,
  multidevice: true,
  headless: true,
  mkdirFolderToken: '.wwebjs_auth', // persistencia de sesión
})
.then((client) => start(client))
.catch((err) => console.error('❌ Error iniciando Venom:', err));

function start(client) {
  console.log("🤖 Venom iniciado correctamente");

  // Escuchar mensajes entrantes
  client.onMessage(async (message) => {
    console.log(`📩 Mensaje recibido: ${message.body} de ${message.from}`);

    try {
      // Crear JWT para x-user-key
      const xUserKey = jwt.sign({ id: message.from }, BOTPRESS_API_KEY, { algorithm: "HS256" });

      // Enviar mensaje a Botpress
      const bpResponse = await fetch(
        `${BOTPRESS_CHAT_API_BASE}/${BOTPRESS_WEBHOOK_ID}/createMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-key": xUserKey,
          },
          body: JSON.stringify({
            type: "text",
            text: message.body,
          }),
        }
      );

      if (!bpResponse.ok) {
        const errorText = await bpResponse.text();
        console.error("❌ Error enviando a Botpress:", bpResponse.status, errorText);
        return;
      }

      const bpData = await bpResponse.json();
      console.log("✅ Botpress respondió:", bpData);

      // Si Botpress responde con mensaje de salida
      if (bpData && bpData.payload && bpData.payload.type === "text") {
        await client.sendText(message.from, bpData.payload.text);
      }

    } catch (error) {
      console.error("❌ Error general:", error.message);
    }
  });
}

// Endpoint para pruebas
app.get("/", (req, res) => {
  res.send("✅ Server Venom + Botpress corriendo");
});

app.listen(PORT, () => {
  console.log(`🚀 Server escuchando en puerto ${PORT}`);
});