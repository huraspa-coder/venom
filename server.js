const express = require("express");
const fs = require("fs");
const path = require("path");
const venom = require("venom-bot");

const app = express();
const PORT = process.env.PORT || 3000;

// Ruta de almacenamiento del QR
const qrPath = "/data/tokens/qr.png";

// Servir el QR desde la ruta /qr
app.get("/qr", (req, res) => {
  if (fs.existsSync(qrPath)) {
    res.sendFile(qrPath);
  } else {
    res.status(404).send("QR no encontrado todavía");
  }
});

// Crear sesión de Venom
venom
  .create(
    "venom-session",
    (base64Qr) => {
      // Convertir y guardar QR
      let matches = base64Qr.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        let imageBuffer = Buffer.from(matches[2], "base64");
        fs.mkdirSync(path.dirname(qrPath), { recursive: true });
        fs.writeFileSync(qrPath, imageBuffer, "binary");
        console.log("✅ QR guardado en:", qrPath);
      }
    },
    undefined,
    { logQR: false, headless: true }
  )
  .then((client) => {
    console.log("✅ Cliente iniciado correctamente");
  })
  .catch((err) => {
    console.error("❌ Error iniciando Venom:", err);
  });

// Iniciar servidor Express
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
  console.log(`👉 Accede al QR en: http://localhost:${PORT}/qr`);
});
