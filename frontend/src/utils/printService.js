/**
 * POSx Suite Unified Print Service
 *
 * Priority:
 *   1. Local Bridge (http://<bridge-ip>:8765) — Wi-Fi thermal printer via TCP/9100
 *   2. Browser window.print()                  — fallback with styled receipt
 *
 * Works the same whether running as PWA (browser) or Capacitor Android APK.
 * Configure the bridge URL in Admin → Settings → Printer Groups → Bridge URL.
 */

// ─── ESC/POS byte constants ───────────────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;

const CMD = {
  INIT          : [ESC, 0x40],
  BOLD_ON       : [ESC, 0x45, 0x01],
  BOLD_OFF      : [ESC, 0x45, 0x00],
  ALIGN_LEFT    : [ESC, 0x61, 0x00],
  ALIGN_CENTER  : [ESC, 0x61, 0x01],
  ALIGN_RIGHT   : [ESC, 0x61, 0x02],
  SIZE_NORMAL   : [ESC, 0x21, 0x00],
  SIZE_DOUBLE_H : [ESC, 0x21, 0x10],
  SIZE_DOUBLE_WH: [ESC, 0x21, 0x30],
  FEED          : [0x0a],
  CUT           : [GS, 0x56, 0x41, 0x03],
  OPEN_DRAWER   : [ESC, 0x70, 0x00, 0x19, 0xfa],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function enc(text) {
  return Array.from(new TextEncoder().encode(text));
}

function pad(str, len) {
  return String(str).substring(0, len).padEnd(len);
}

function rpad(str, len) {
  return String(str).substring(0, len).padStart(len);
}

function fmtCurrency(amount) {
  const sym = localStorage.getItem("pos_currency_symbol") || "₦";
  const n = Number(amount || 0);
  return `${sym}${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
}

function divider(char = "-", len = 32) {
  return char.repeat(len);
}

// ─── ESC/POS receipt builder ─────────────────────────────────────────────────
function buildReceiptBytes(data) {
  const {
    businessName = "POSx Suite",
    address = "",
    phone = "",
    orderNo = "",
    tableName = "",
    cashier = "",
    items = [],
    subtotal = 0,
    taxAmount = 0,
    discount = 0,
    total = 0,
    amountPaid = 0,
    change = 0,
    paymentMethod = "",
    footer = "Thank you! Please come again.",
    openDrawer = false,
  } = data;

  const b = [];
  const add = (...bytes) => b.push(...bytes);
  const line = (text) => { b.push(...enc(text)); b.push(0x0a); };

  add(...CMD.INIT);

  // Open cash drawer if requested
  if (openDrawer) add(...CMD.OPEN_DRAWER);

  // Header
  add(...CMD.ALIGN_CENTER, ...CMD.BOLD_ON, ...CMD.SIZE_DOUBLE_H);
  line(businessName);
  add(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF);
  if (address) line(address);
  if (phone)   line(`Tel: ${phone}`);
  line(divider("="));

  // Order info
  add(...CMD.ALIGN_LEFT);
  if (tableName) line(`Table  : ${tableName}`);
  if (orderNo)   line(`Order  : ${orderNo}`);
  if (cashier)   line(`Cashier: ${cashier}`);
  line(`Date   : ${new Date().toLocaleString()}`);
  line(divider());

  // Items
  line(`${"ITEM".padEnd(18)} ${"QTY".padEnd(4)} ${"PRICE".padStart(9)}`);
  line(divider());
  for (const item of items) {
    const name  = pad(item.name, 18);
    const qty   = pad(`x${item.quantity}`, 4);
    const price = rpad(fmtCurrency((item.price || 0) * (item.quantity || 1)), 9);
    line(`${name} ${qty} ${price}`);
    if (item.note) line(`  * ${item.note}`);
  }

  // Totals
  line(divider());
  add(...CMD.ALIGN_RIGHT);
  line(`Subtotal : ${fmtCurrency(subtotal)}`);
  if (discount > 0) line(`Discount : -${fmtCurrency(discount)}`);
  if (taxAmount > 0) line(`Tax      : ${fmtCurrency(taxAmount)}`);
  add(...CMD.BOLD_ON, ...CMD.SIZE_DOUBLE_H);
  line(`TOTAL    : ${fmtCurrency(total)}`);
  add(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF);
  if (amountPaid > 0) {
    line(`Paid     : ${fmtCurrency(amountPaid)}`);
    line(`Change   : ${fmtCurrency(change)}`);
  }
  if (paymentMethod) line(`Method   : ${paymentMethod.toUpperCase()}`);

  // Footer
  add(...CMD.ALIGN_CENTER);
  line(divider("="));
  line(footer);
  add(...CMD.FEED, ...CMD.FEED, ...CMD.FEED, ...CMD.CUT);

  return b;
}

// ─── ESC/POS kitchen ticket builder ──────────────────────────────────────────
function buildKitchenBytes(data) {
  const {
    tableName = "",
    orderNo = "",
    items = [],
    note = "",
    station = "KITCHEN",
  } = data;

  const b = [];
  const add = (...bytes) => b.push(...bytes);
  const line = (text) => { b.push(...enc(text)); b.push(0x0a); };

  add(...CMD.INIT);
  add(...CMD.ALIGN_CENTER, ...CMD.BOLD_ON, ...CMD.SIZE_DOUBLE_WH);
  line(station);
  add(...CMD.SIZE_DOUBLE_H);
  if (tableName) line(`TABLE: ${tableName}`);
  add(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF);
  line(`Order: ${orderNo}`);
  line(new Date().toLocaleTimeString());
  line(divider("="));

  add(...CMD.ALIGN_LEFT);
  for (const item of items) {
    add(...CMD.SIZE_DOUBLE_H, ...CMD.BOLD_ON);
    line(`${item.quantity}x ${item.name}`);
    add(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF);
    if (item.note) line(`   * ${item.note}`);
  }

  line(divider("="));
  if (note) { add(...CMD.BOLD_ON); line(`NOTE: ${note}`); add(...CMD.BOLD_OFF); }

  add(...CMD.FEED, ...CMD.FEED, ...CMD.FEED, ...CMD.CUT);
  return b;
}

// ─── Bridge communication ─────────────────────────────────────────────────────
async function sendToBridge({ bridgeUrl, printerIp, printerPort = 9100, bytes }) {
  const token = localStorage.getItem("print_bridge_token") || "posx-bridge-2025";
  const res = await fetch(`${bridgeUrl}/print`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bridge-Token": token,
    },
    body: JSON.stringify({ ip: printerIp, port: printerPort, data: bytes }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Bridge error ${res.status}`);
  }
  return res.json();
}

// ─── Browser fallback print ───────────────────────────────────────────────────
function browserPrint(html) {
  const w = window.open("", "_blank", "width=420,height=700");
  if (!w) { alert("Allow popups to print receipts"); return; }
  w.document.write(`<!DOCTYPE html>
<html><head><title>Receipt</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; padding: 8px; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: bold; }
  .big    { font-size: 16px; }
  .divider{ border-top: 1px dashed #000; margin: 4px 0; }
  @media print { @page { margin: 0; size: 80mm auto; } }
</style>
</head><body>${html}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); w.close(); }, 400);
}

function receiptToHtml(data) {
  const {
    businessName = "POSx Suite",
    address = "",
    phone = "",
    orderNo = "",
    tableName = "",
    items = [],
    subtotal = 0,
    taxAmount = 0,
    discount = 0,
    total = 0,
    paymentMethod = "",
    footer = "Thank you! Please come again.",
  } = data;

  const rows = items.map(i =>
    `<tr><td>${i.name}</td><td>x${i.quantity}</td><td class="right">${fmtCurrency((i.price||0)*(i.quantity||1))}</td></tr>`
  ).join("");

  return `
    <div class="center bold big">${businessName}</div>
    ${address ? `<div class="center">${address}</div>` : ""}
    ${phone   ? `<div class="center">Tel: ${phone}</div>` : ""}
    <div class="divider"></div>
    ${tableName ? `<div>Table  : ${tableName}</div>` : ""}
    ${orderNo   ? `<div>Order  : ${orderNo}</div>` : ""}
    <div>Date   : ${new Date().toLocaleString()}</div>
    <div class="divider"></div>
    <table width="100%">
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="divider"></div>
    <div class="right">Subtotal : ${fmtCurrency(subtotal)}</div>
    ${discount > 0 ? `<div class="right">Discount : -${fmtCurrency(discount)}</div>` : ""}
    ${taxAmount > 0 ? `<div class="right">Tax      : ${fmtCurrency(taxAmount)}</div>` : ""}
    <div class="right bold big">TOTAL    : ${fmtCurrency(total)}</div>
    ${paymentMethod ? `<div class="right">Method   : ${paymentMethod.toUpperCase()}</div>` : ""}
    <div class="divider"></div>
    <div class="center">${footer}</div>
  `;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export const printService = {
  /**
   * Test bridge connection. Returns true if reachable.
   */
  async testBridge(bridgeUrl) {
    try {
      const res = await fetch(`${bridgeUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data.ok === true;
    } catch {
      return false;
    }
  },

  /**
   * Print a customer receipt.
   * @param {object} receiptData - order data
   * @param {object} printerConfig - { bridgeUrl, ip, port }
   */
  async printReceipt(receiptData, printerConfig = {}) {
    const bytes = buildReceiptBytes(receiptData);
    return this._print(bytes, receiptData, printerConfig, "receipt");
  },

  /**
   * Print a kitchen/bar ticket.
   * @param {object} ticketData - order data for kitchen
   * @param {object} printerConfig - { bridgeUrl, ip, port }
   */
  async printKitchenTicket(ticketData, printerConfig = {}) {
    const bytes = buildKitchenBytes(ticketData);
    return this._print(bytes, ticketData, printerConfig, "kitchen");
  },

  async _print(bytes, data, printerConfig, type) {
    const bridgeUrl = (printerConfig.bridgeUrl
      || localStorage.getItem("print_bridge_url") || "").trim().replace(/[).,\s]+$/, "").replace(/\/+$/, "");
    const printerIp   = printerConfig.ip   || "";
    const printerPort = printerConfig.port || 9100;
    const token = localStorage.getItem("print_bridge_token") || "posx-bridge-2025";

    let usbPrinter = printerConfig.printer || null;
    if (!usbPrinter) {
      try {
        const saved = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
        usbPrinter = saved.find((x) => x.mode === "usb" && x.type === type) || null;
      } catch (_) {}
    }

    console.log("[PrintService._print]", { type, bridgeUrl, hasUsbPrinter: !!usbPrinter, printerName: usbPrinter?.windows_printer_name || usbPrinter?.name });

    if (usbPrinter) {
      if (!bridgeUrl) throw new Error("Set a Bridge URL in Terminal Settings → Printers");
      const printerName = (usbPrinter.windows_printer_name || usbPrinter.name || "").trim();
      if (!printerName) throw new Error("USB printer has no system name — open Terminal Settings → Printers and edit it");
      console.log("[PrintService] sending to bridge:", `${bridgeUrl}/print-usb`, "printer:", printerName);
      const res = await fetch(`${bridgeUrl}/print-usb`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bridge-Token": token },
        body: JSON.stringify({ printer_name: printerName, data: bytes }),
        signal: AbortSignal.timeout(15000),
      });
      console.log("[PrintService] bridge response:", res.status, res.ok);
      if (res.ok) return { success: true, method: "usb" };
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Bridge error ${res.status}`);
    }

    // Network printer via bridge /print
    if (printerIp) {
      try {
        await sendToBridge({ bridgeUrl, printerIp, printerPort, bytes });
        return { success: true, method: "bridge" };
      } catch (err) {
        console.warn("[PrintService] Bridge failed:", err.message);
      }
    }

    // If bridge URL is configured but no USB printer found → error, not silent browser popup
    if (bridgeUrl) {
      throw new Error("No USB receipt printer found — open Terminal Settings → Printers tab to load printer list");
    }

    // Browser fallback (only when bridge is not configured at all)
    console.warn("[PrintService] falling back to browser print — bridgeUrl empty");
    if (type === "receipt") {
      browserPrint(receiptToHtml(data));
    } else {
      window.print();
    }
    return { success: true, method: "browser" };
  },
};

export default printService;
