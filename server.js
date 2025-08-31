// server.js
const fs = require("fs-extra");
const path = require("path");
const express = require("express");
const venom = require("venom-bot");

const app = express();
const PORT = process.env.PORT || 3000;

// Carpeta persistente en Railway
const SESSION_DIR = "/data/venom-session";
const QR_PATH = path.join(SESSION_DIR, "qr.png");

// Carpeta de sesión dentro del repo (subida a GitHub)
const REPO_SESSION_DIR = path.join(__dirname, "venom-session");

// Crear carpeta persistente si no existe
fs.mkdirSync(SESSION_DIR, { recursive: true });

// Copiar la sesión del repo al volumen solo si aún no existe
if (!fs.existsSync(path.join(SESSION_DIR, "Default"))) {
  console.log("📂 Copiando sesión desde repo a volumen...");
  fs.copySync(REPO_SESSION_DIR, SESSION_DIR);
  console.log("✅ Sesión copiada correctamente.");
}

// Middleware para JSON
app.use(express.json());

// Endpoint para ver el QR (solo en caso de que no haya sesión)
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
      // Guardar QR en PNG (solo en caso de iniciar sesión por primera vez)
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

// Endpoint para enviar mensaje
app.post("/send-message", async (req, res) => {
  const { to, message } = req.body;
  if (!venomClient || !venomClient.isConnected()) {
    return res.status(500).json({ status: "error", message: "Cliente no conectado" });
  }

  try {
    await venomClient.sendText(to, message);
    res.json({ status: "success", to, message });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.toString() });
  }
});

// Healthcheck
app.get("/", (req, res) => res.send("Venom BOT corriendo en Railway 🚀"));

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});
