// server.js
const fs = require("fs");
const path = require("path");
const express = require("express");
const venom = require("venom-bot");
const unzipper = require("unzipper"); // npm i unzipper
const app = express();
const PORT = process.env.PORT || 3000;

// Carpeta persistente en Railway
const SESSION_DIR = "/data/venom-session";
const QR_PATH = path.join(SESSION_DIR, "qr.png");

// Crear carpeta si no existe
fs.mkdirSync(SESSION_DIR, { recursive: true });
console.log("📂 Carpeta de tokens asegurada en:", SESSION_DIR);

// Si existe un zip de sesión, descomprimirlo automáticamente
const SESSION_ZIP = path.join(__dirname, "venom-session.zip");
if (fs.existsSync(SESSION_ZIP)) {
  fs.createReadStream(SESSION_ZIP)
    .pipe(unzipper.Extract({ path: SESSION_DIR }))
    .on("close", () => console.log("✅ Sesión descomprimida en:", SESSION_DIR));
}

app.use(express.json());

// Endpoint para ver el QR (solo si se genera uno nuevo)
app.get("/qr", (req, res) => {
  if (fs.existsSync(QR_PATH)) {
    res.sendFile(QR_PATH);
  } else {
    res.status(404).send("QR aún no generado");
  }
});

// Endpoint para status de sesión
app.get("/status", (req, res) => {
  if (venomClient && venomClient.isConnected()) {
    res.json({ status: "logged", message: "Cliente WhatsApp conectado ✅" });
  } else {
    res.json({ status: "not_logged", message: "Cliente esperando QR o no iniciado ❌" });
  }
});

let venomClient;

// Crear sesión Venom
venom
  .create(
    "venom-session",
    (base64Qr) => {
      // Guardar QR en PNG si se necesita
      const matches = base64Qr.match(/^data:image\/png;base64,(.+)$/);
      if (matches) {
        const buffer = Buffer.from(matches[1], "base64");
        fs.writeFileSync(QR_PATH, buffer, "binary");
        console.log("✅ QR guardado en:", QR_PATH);
      }
    },
    undefined,
    {
      headless: true,
      logQR: false,
      browserPathExecutable: "/usr/bin/chromium",
      browserArgs: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
      mkdirFolderToken: SESSION_DIR,
      folderNameToken: "venom-session",
    }
  )
  .then((client) => {
    venomClient = client;
    console.log("🤖 Venom iniciado correctamente");

    client.onMessage((message) => {
      console.log(`📩 Mensaje recibido: ${message.body} de ${message.from}`);
      if (message.body.toLowerCase() === "hola") {
        client.sendText(message.from, "👋 Hola, bot funcionando!").catch(console.error);
      }
    });
  })
  .catch((err) => console.error("❌ Error iniciando Venom:", err));

// Endpoint para enviar mensajes vía POST
app.post("/send-message", async (req, res) => {
  if (!venomClient || !venomClient.isConnected()) {
    return res.status(400).json({ error: "Cliente no conectado" });
  }

  const { to, message } = req.body;
  if (!to || !message) {
    return res.status(400).json({ error: "Faltan parámetros 'to' o 'message'" });
  }

  try {
    await venomClient.sendText(to.includes("@c.us") ? to : `${to}@c.us`, message);
    res.json({ status: "success", to, message });
  } catch (error) {
    res.status(500).json({ status: "error", error: error.toString() });
  }
});

// Healthcheck
app.get("/", (req, res) => res.send("Venom BOT corriendo en Railway 🚀"));

app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});
