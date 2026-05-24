/** CGST + SGST rates (percent). Total GST = CGST + SGST. */
const CGST_RATE = Number(process.env.CGST_RATE || 2.5);
const SGST_RATE = Number(process.env.SGST_RATE || 2.5);
const TOTAL_GST_RATE = CGST_RATE + SGST_RATE;

function roundRupees(n) {
  return Math.max(0, Math.round(Number(n) || 0));
}

/**
 * GST embedded in an inclusive bill total (menu prices include GST).
 * e.g. ₹420 bill → CGST ₹10, SGST ₹10, total GST ₹20 (5% of pre-tax ₹400).
 */
function computeGstBreakdown(inclusiveTotal) {
  const total = roundRupees(inclusiveTotal);
  if (total <= 0) {
    return {
      cgst: 0,
      sgst: 0,
      totalGst: 0,
      taxableValue: 0,
      cgstRate: CGST_RATE,
      sgstRate: SGST_RATE,
      totalGstRate: TOTAL_GST_RATE,
    };
  }

  const totalGst = roundRupees((total * TOTAL_GST_RATE) / (100 + TOTAL_GST_RATE));
  const cgst = roundRupees((totalGst * CGST_RATE) / TOTAL_GST_RATE);
  const sgst = totalGst - cgst;
  const taxableValue = total - totalGst;

  return {
    cgst,
    sgst,
    totalGst,
    taxableValue,
    cgstRate: CGST_RATE,
    sgstRate: SGST_RATE,
    totalGstRate: TOTAL_GST_RATE,
  };
}

/** WhatsApp / order-note lines after Total. */
function appendGstLines(lines, inclusiveTotal) {
  const gst = computeGstBreakdown(inclusiveTotal);
  if (gst.totalGst <= 0) return gst;
  lines.push(`CGST (${gst.cgstRate}%) = ₹${gst.cgst}`);
  lines.push(`SGST (${gst.sgstRate}%) = ₹${gst.sgst}`);
  lines.push(`Total GST (${gst.totalGstRate}%) = ₹${gst.totalGst}`);
  return gst;
}

module.exports = {
  CGST_RATE,
  SGST_RATE,
  TOTAL_GST_RATE,
  computeGstBreakdown,
  appendGstLines,
};
