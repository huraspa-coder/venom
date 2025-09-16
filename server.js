// server.js — Venom + Express + QR para local y nube
const express = require("express");
const venom = require("venom-bot");
const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SESSION_PATH = process.env.SESSION_PATH || path.join(__dirname, "session");
const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
const QR_FILE = path.join(PUBLIC_DIR, "qr.png");

// Detectar si estamos en Railway/Linux sin GUI
const isCloud = process.platform === "linux" && process.env.RAILWAY_PROJECT_ID;

// SSE broadcaster
let clients = [];
app.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  res.write("retry: 10000\n\n");
  clients.push(res);
  req.on("close", () => { clients = clients.filter(c => c !== res); });
});

app.use(express.static(PUBLIC_DIR));

app.get("/qr", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "qr.html")));

function notifyClients() {
  const msg = `data: update\n\n`;
  clients.forEach(res => { try { res.write(msg); } catch (e) {} });
}

// Crear qr.html si no existe
const QR_HTML = path.join(PUBLIC_DIR, "qr.html");
if (!fs.existsSync(QR_HTML)) {
  const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>QR Venom</title>
<style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f6f7fb;font-family:system-ui,Arial}.card{background:#fff;padding:24px;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,0.08);text-align:center}img{width:320px;height:320px;object-fit:contain}h1{font-size:18px;margin:0 0 12px}p{color:#555;margin:8px 0 0;font-size:13px}</style>
</head>
<body>
<div class="card">
<h1>Escanea el QR con WhatsApp</h1>
<img id="qr" src="qr.png?ts=${Date.now()}" alt="QR">
<p id="status">Esperando QR...</p>
</div>
<script>
const evt = new EventSource('/events');
const qrImg = document.getElementById('qr');
const status = document.getElementById('status');
evt.onmessage = function(e){qrImg.src='qr.png?ts='+Date.now();status.textContent='QR actualizado: '+new Date().toLocaleTimeString();};
evt.onerror = function(){status.textContent='Conexión SSE perdida.';};
</script>
</body>
</html>`;
  fs.writeFileSync(QR_HTML, html, "utf8");
}

// Función para abrir Chromium en local
function tryOpenChromium(url) {
  if (isCloud) return false; // No abrir en nube
  const candidates = ["chromium", "chromium-browser", "google-chrome", "chrome", "brave-browser"];
  for (const exe of candidates) {
    try {
      const whichCmd = process.platform === "win32" ? `where ${exe}` : `which ${exe}`;
      const which = execSync(whichCmd, { stdio: ["pipe","pipe","ignore"] }).toString().trim();
      if (which) { spawn(which, [url, "--new-window"], { detached:true, stdio:"ignore" }).unref(); console.log(`Intentando abrir ${exe} en ${url}`); return true; }
    } catch(e){}
  }
  console.warn("No se encontró navegador. Abre manualmente: " + url);
  return false;
}

// Inicializar Venom
(async () => {
  try {
    const client = await venom.create({
      session: SESSION_PATH,
      multidevice: true,
      headless: isCloud,      // headless true solo en Railway/Linux
      useChrome: true,
      chromiumArgs: [
        '--no-sandbox','--disable-setuid-sandbox',
        ...(isCloud ? ['--disable-dev-shm-usage','--disable-gpu','--remote-debugging-port=9222'] : [])
      ]
    },
    (base64Qr, asciiQR, attempts, urlCode) => { if(base64Qr) saveQrBase64(base64Qr); },
    (statusSession, session) => { console.log("StatusSession:", statusSession); });

    client.onStateChange(state => console.log("State changed:", state));

    // Mensajes entrantes
    client.onMessage(async (message) => {
      console.log("Mensaje entrante:", message.from, message.body);
      if(message.body){
        await client.sendText(message.from, `Recibí tu mensaje: "${message.body}"`);
      }
    });

    app.listen(PORT, () => {
      const url = `http://localhost:${PORT}/qr`;
      console.log(`Servidor QR corriendo en ${url}`);
      tryOpenChromium(url);
    });

  } catch (err) { console.error("Error inicializando Venom:", err); process.exit(1); }
})();

function saveQrBase64(data) {
  try {
    const base64 = data.split(",").pop();
    const buffer = Buffer.from(base64,"base64");
    fs.writeFileSync(QR_FILE, buffer);
    console.log("QR guardado en", QR_FILE);
    notifyClients();
  } catch(e){ console.error("Error guardando QR:", e);}
}
