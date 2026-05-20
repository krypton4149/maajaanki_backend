const fs = require("fs");
const path = require("path");

const DEFAULT_QR_PATH = path.join(__dirname, "../../assets/upi-qr.png");

function getQrLocalPath() {
  const custom = String(process.env.RESTAURANT_UPI_QR_PATH || "").trim();
  if (custom && fs.existsSync(custom)) return custom;
  if (fs.existsSync(DEFAULT_QR_PATH)) return DEFAULT_QR_PATH;
  return null;
}

function getQrPublicUrl() {
  const direct = String(process.env.RESTAURANT_UPI_QR_URL || "").trim();
  if (direct) return direct;

  const base =
    String(process.env.APP_PUBLIC_URL || "").trim() ||
    String(process.env.PUBLIC_BASE_URL || "").trim();
  if (base && getQrLocalPath()) {
    return `${base.replace(/\/$/, "")}/assets/upi-qr.png`;
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
