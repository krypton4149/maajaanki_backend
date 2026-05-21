const fs = require("fs");
const path = require("path");

const QR_FILENAME = "upi-qr-hdfc.png";
const QR_CACHE_BUST = "v=20260521";

const DEFAULT_QR_PATH = path.join(__dirname, "../../assets", QR_FILENAME);
const LEGACY_QR_PATH = path.join(__dirname, "../../assets/upi-qr.png");

function resolveQrPath() {
  const custom = String(process.env.RESTAURANT_UPI_QR_PATH || "").trim();
  if (custom && fs.existsSync(custom)) return custom;
  if (fs.existsSync(DEFAULT_QR_PATH)) return DEFAULT_QR_PATH;
  if (fs.existsSync(LEGACY_QR_PATH)) return LEGACY_QR_PATH;
  return null;
}

function getQrLocalPath() {
  return resolveQrPath();
}

function getQrPublicUrl() {
  const direct = String(process.env.RESTAURANT_UPI_QR_URL || "").trim();
  if (direct) return direct;

  const base =
    String(process.env.APP_PUBLIC_URL || "").trim() ||
    String(process.env.PUBLIC_BASE_URL || "").trim();
  const local = resolveQrPath();
  if (base && local) {
    const name = path.basename(local);
    return `${base.replace(/\/$/, "")}/assets/${name}?${QR_CACHE_BUST}`;
  }
  return null;
}

function isQrAvailable() {
  return !!(getQrPublicUrl() || getQrLocalPath());
}

module.exports = {
  getQrLocalPath,
  getQrPublicUrl,
  isQrAvailable,
  DEFAULT_QR_PATH,
};
