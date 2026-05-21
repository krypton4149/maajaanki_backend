/**
 * Call from admin Live Orders dashboard when tick → Out for delivery.
 *
 * Example:
 *   await MaajaankiDispatch.markOutForDelivery("MJ-1038");
 */
(function (global) {
  const API_BASE =
    global.MAAJAANKI_API_URL || "https://maajaanki-backend.vercel.app";

  async function markOutForDelivery(orderRef, options = {}) {
    const key =
      options.adminKey ||
      global.MAAJAANKI_ADMIN_KEY ||
      (typeof localStorage !== "undefined"
        ? localStorage.getItem("mj_admin_key")
        : "");

    if (!key) throw new Error("Set MAAJAANKI_ADMIN_KEY or mj_admin_key in localStorage");

    const ref = String(orderRef || "").replace(/^#/, "");
    const res = await fetch(`${API_BASE}/api/admin/orders/out-for-delivery`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": key,
      },
      body: JSON.stringify({
        orderRef: ref,
        resend: !!options.resend,
      }),
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.message || "Out for delivery failed");
    return data;
  }

  global.MaajaankiDispatch = { markOutForDelivery, API_BASE };
})(typeof window !== "undefined" ? window : globalThis);
