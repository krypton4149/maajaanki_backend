/** CGST + SGST rates (percent). Total GST = CGST + SGST. */
const CGST_RATE = Number(process.env.CGST_RATE || 2.5);
const SGST_RATE = Number(process.env.SGST_RATE || 2.5);
const TOTAL_GST_RATE = CGST_RATE + SGST_RATE;

function roundRupees(n) {
  return Math.max(0, Math.round(Number(n) || 0));
}

/**
 * GST added on top of subtotal + delivery (menu prices are before GST).
 * e.g. ₹525 → CGST ₹13 + SGST ₹13 → pay ₹551.
 */
function computeExclusiveGst(taxableAmount) {
  const base = roundRupees(taxableAmount);
  if (base <= 0) {
    return {
      cgst: 0,
      sgst: 0,
      totalGst: 0,
      taxableValue: 0,
      grandTotal: 0,
      cgstRate: CGST_RATE,
      sgstRate: SGST_RATE,
      totalGstRate: TOTAL_GST_RATE,
    };
  }

  const cgst = roundRupees((base * CGST_RATE) / 100);
  const sgst = roundRupees((base * SGST_RATE) / 100);
  const totalGst = cgst + sgst;

  return {
    cgst,
    sgst,
    totalGst,
    taxableValue: base,
    grandTotal: base + totalGst,
    cgstRate: CGST_RATE,
    sgstRate: SGST_RATE,
    totalGstRate: TOTAL_GST_RATE,
  };
}

/** Merge delivery totals with GST; finalTotal is what customer pays (incl. GST). */
function applyGstToDeliveryTotals(deliveryTotals) {
  const amountBeforeGst = roundRupees(
    (deliveryTotals.foodTotal ?? 0) + (deliveryTotals.deliveryCharge ?? 0)
  );
  const gst = computeExclusiveGst(amountBeforeGst);
  return {
    ...deliveryTotals,
    amountBeforeGst,
    cgst: gst.cgst,
    sgst: gst.sgst,
    totalGst: gst.totalGst,
    cgstRate: gst.cgstRate,
    sgstRate: gst.sgstRate,
    totalGstRate: gst.totalGstRate,
    finalTotal: gst.grandTotal,
  };
}

/** WhatsApp / receipt lines — GST lines then grand total. */
function appendGstLines(lines, totalsOrTaxableAmount) {
  const gst =
    totalsOrTaxableAmount != null &&
    typeof totalsOrTaxableAmount === "object" &&
    totalsOrTaxableAmount.totalGst != null
      ? {
          cgst: totalsOrTaxableAmount.cgst,
          sgst: totalsOrTaxableAmount.sgst,
          totalGst: totalsOrTaxableAmount.totalGst,
          cgstRate: totalsOrTaxableAmount.cgstRate ?? CGST_RATE,
          sgstRate: totalsOrTaxableAmount.sgstRate ?? SGST_RATE,
          totalGstRate: totalsOrTaxableAmount.totalGstRate ?? TOTAL_GST_RATE,
        }
      : computeExclusiveGst(totalsOrTaxableAmount);

  if (gst.totalGst > 0) {
    lines.push(`CGST (${gst.cgstRate}%) = ₹${gst.cgst}`);
    lines.push(`SGST (${gst.sgstRate}%) = ₹${gst.sgst}`);
    lines.push(`Total GST (${gst.totalGstRate}%) = ₹${gst.totalGst}`);
  }
  return gst;
}

/** @deprecated use computeExclusiveGst — kept for any legacy callers */
function computeGstBreakdown(taxableAmount) {
  return computeExclusiveGst(taxableAmount);
}

module.exports = {
  CGST_RATE,
  SGST_RATE,
  TOTAL_GST_RATE,
  computeExclusiveGst,
  computeGstBreakdown,
  applyGstToDeliveryTotals,
  appendGstLines,
};
