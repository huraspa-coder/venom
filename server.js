// server.js — Venom + Express + abrir Chromium con QR visible y auto-refresh
const express = require("express");
const venom = require("venom-bot");
const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SESSION_PATH = process.env.SESSION_PATH || path.join(__dirname, "session"); // ajustar si usas otro path

// carpeta pública donde se guardará qr.png y qr.html
const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// archivo QR
const QR_FILE = path.join(PUBLIC_DIR, "qr.png");

// simple SSE broadcaster para notificar cambios del QR a la página
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
  req.on("close", () => {
    clients = clients.filter((c) => c !== res);
  });
});

// sirve archivos estáticos (qr.png, qr.html, logo si quieres)
app.use(express.static(PUBLIC_DIR));

// ruta amigable para ver el QR
app.get("/qr", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "qr.html"));
});

function notifyClients() {
  const msg = `data: update\n\n`;
  clients.forEach((res) => {
    try {
      res.write(msg);
    } catch (e) {
      // ignore
    }
  });
}

// crea la página qr.html (si no existe) con JS que escucha SSE y actualiza la imagen automáticamente
const QR_HTML = path.join(PUBLIC_DIR, "qr.html");
if (!fs.existsSync(QR_HTML)) {
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>QR Venom</title>
<style>
  body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f6f7fb;font-family:system-ui,Arial}
  .card{background:#fff;padding:24px;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,0.08);text-align:center}
  img{width:320px;height:320px;object-fit:contain}
  h1{font-size:18px;margin:0 0 12px}
  p{color:#555;margin:8px 0 0;font-size:13px}
</style>
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

  evt.onmessage = function(e) {
    // cuando backend avisa, refrescamos la imagen con query param para evitar cache
    qrImg.src = 'qr.png?ts=' + Date.now();
    status.textContent = 'QR actualizado: ' + new Date().toLocaleTimeString();
  };

  evt.onerror = function() {
    status.textContent = 'Conexión SSE perdida. Intenta recargar la página.';
  };
</script>
</body>
</html>`;
  fs.writeFileSync(QR_HTML, html, "utf8");
}

// función para intentar abrir Chromium (varios binarios comunes)
function tryOpenChromium(url) {
  const candidates = ["chromium", "chromium-browser", "google-chrome", "chrome", "brave-browser"];
  for (const exe of candidates) {
    try {
      const which = execSync(`which ${exe}`, { stdio: ["pipe", "pipe", "ignore"] }).toString().trim();
      if (which) {
        // abrimos en modo normal (no headless). --new-window para enfocarlo
        spawn(which, [url, "--new-window"], {
          detached: true,
          stdio: "ignore",
        }).unref();
        console.log(`Intentando abrir ${exe} en ${url}`);
        return true;
      }
    } catch (e) {
      // no encontrado, probar siguiente
    }
  }
  console.warn("No se encontró ejecutable Chromium/Chrome. Abre manualmente: " + url);
  return false;
}

// Inicializamos Venom
(async () => {
  try {
    const client = await venom.create(
      // session name
      {
        session: SESSION_PATH,
        multidevice: true,
      },
      (base64Qr, asciiQR, attempts, urlCode) => {
        // handler opcional de QR en creación (algunos flujos devuelven el base64 aquí)
        // si te llega base64 desde aquí, también lo guardamos
        if (base64Qr) {
          saveQrBase64(base64Qr);
        }
      },
      (statusSession, session) => {
        console.log("StatusSession:", statusSession);
      },
      {
        // ajustes puppeteer para asegurar que no sea headless (si se desea)
        headless: true, // Venom usa puppeteer internamente; mantenemos headless interno
      }
    );

    // alternativa: cliente emite 'qr' via client.on
    try {
      client.on("qr", (base64Qr) => {
        if (base64Qr) saveQrBase64(base64Qr);
      });
    } catch (e) {
      // algunas versiones usan client.on('qr')
    }

    client.onAny((event) => {
      // opcional: para debug puedes descomentar
      // console.log("Evento Venom:", event);
    });

    // example: cliente conectado -> log
    client.onStateChange((state) => {
      console.log("State changed:", state);
    });

    // si el cliente recibe mensajes y no te llegan, revisa que tu webhook / integracion esté webhook-enabled.
    client.onMessage((message) => {
      console.log("Mensaje entrante:", message.from, message.body);
      // aquí puedes procesarlos / reenviarlos a tu server interno
    });

    // starter de express
    app.listen(PORT, () => {
      const url = `http://localhost:${PORT}/qr`;
      console.log(`Servidor QR corriendo en ${url}`);
      // intenta abrir Chromium (no falla si no existe)
      tryOpenChromium(url);
    });

  } catch (err) {
    console.error("Error inicializando Venom:", err);
    process.exit(1);
  }
})();

// guarda base64 (data:image/png;base64,...) a public/qr.png
function saveQrBase64(data) {
  try {
    // data puede venir con o sin prefijo "data:image/png;base64,"
    const base64 = data.split(",").pop();
    const buffer = Buffer.from(base64, "base64");
    fs.writeFileSync(QR_FILE, buffer);
    console.log("QR guardado en", QR_FILE);
    notifyClients();
  } catch (e) {
    console.error("Error guardando QR:", e);
  }
}
