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

// Map non-ASCII currency/special chars to printable ASCII equivalents
const _CHAR_MAP = {
  '₦': 'N',    // ₦ Naira
  '€': 'EUR',  // €
  '£': 'GBP',  // £
  '¥': 'Y',    // ¥
  '₹': 'Rs',   // ₹
  '₩': 'W',    // ₩
  '₫': 'D',    // ₫
  '¢': 'c',    // ¢
  '✓': 'OK',   // ✓
  '—': '-',    // —
  '…': '...', // …
};

function enc(text) {
  let s = String(text || '');
  for (const [sym, rep] of Object.entries(_CHAR_MAP)) {
    s = s.split(sym).join(rep);
  }
  s = s.replace(/[^\x20-\x7E\n\r]/g, '?');
  return Array.from(new TextEncoder().encode(s));
}

function pad(str, len) {
  return String(str).substring(0, len).padEnd(len);
}

function rpad(str, len) {
  return String(str).substring(0, len).padStart(len);
}

function fmtCurrency(amount) {
  const raw = localStorage.getItem("pos_currency_symbol") || "N";
  const sym = raw.replace(/[^\x20-\x7E]/g, (c) => _CHAR_MAP[c] || '?');
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
    footer = "Thank you!",
    openDrawer = false,
    docType = "RECEIPT",
    layoutSettings = {},
  } = data;

  // Resolve layout toggles (default true for most)
  const S = layoutSettings;
  const showStoreName = S.show_store_name !== false;
  const showAddress   = S.show_address   !== false;
  const showPhone     = S.show_phone     !== false;
  const showDate      = S.show_date      !== false;
  const showSeller    = S.show_seller    !== false;
  const showReference = S.show_reference !== false;
  const showCustomer  = S.show_customer  !== false;
  const showTax       = S.show_tax       !== false;
  const showDiscount  = S.show_discount  !== false;
  const showNote      = S.show_note      !== false;
  const showPaid      = S.show_paid      !== false;
  const showDue       = S.show_due       !== false;
  const printedFooter = S.receipt_footer || footer;
  const printedHeader = S.receipt_header || "";
  const noteText      = S.note_to_customer || "";

  // Paper width: 80mm → 42 chars, 58mm → 32 chars
  const PW = S.paper_size === "80mm" ? 42 : 32;
  const COL_NAME  = PW === 42 ? 22 : 16;
  const COL_QTY   = PW === 42 ? 4  : 3;
  const COL_PRICE = PW === 42 ? 12 : 9;

  const b = [];
  const add = (...bytes) => b.push(...bytes);
  const line = (text) => { b.push(...enc(text)); b.push(0x0a); };
  // pad a value to fill a line: label left, value right
  const tl = (lbl, val) => {
    const v = typeof val === 'string' ? val : fmtCurrency(val);
    const sp = Math.max(1, PW - lbl.length - v.length);
    return lbl + ' '.repeat(sp) + v;
  };

  add(...CMD.INIT);
  if (openDrawer) add(...CMD.OPEN_DRAWER);

  // Business name
  if (showStoreName) {
    add(...CMD.ALIGN_CENTER, ...CMD.BOLD_ON, ...CMD.SIZE_DOUBLE_H);
    line(businessName);
    add(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF);
  }
  if (showAddress && address) { add(...CMD.ALIGN_CENTER); line(address); }
  if (showPhone   && phone)   { add(...CMD.ALIGN_CENTER); line(`Tel: ${phone}`); }
  if (printedHeader)          { add(...CMD.ALIGN_CENTER); line(printedHeader); }
  line(divider("=", PW));

  // Document type label
  add(...CMD.ALIGN_CENTER, ...CMD.BOLD_ON, ...CMD.SIZE_DOUBLE_H);
  line(docType);
  add(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF);
  line(divider("-", PW));

  // Order info
  add(...CMD.ALIGN_LEFT);
  if (showCustomer  && tableName) line(`Table  : ${tableName}`);
  if (showReference && orderNo)   line(`Order  : ${orderNo}`);
  if (showSeller    && cashier)   line(`Cashier: ${cashier}`);
  if (showDate)                   line(`Date   : ${new Date().toLocaleString()}`);
  line(divider("-", PW));

  // Items
  add(...CMD.ALIGN_LEFT);
  line(`${"ITEM".padEnd(COL_NAME)} ${"QTY".padEnd(COL_QTY)} ${"PRICE".padStart(COL_PRICE)}`);
  line(divider("-", PW));
  for (const item of items) {
    const name  = pad(item.name, COL_NAME);
    const qty   = pad(`x${item.quantity}`, COL_QTY);
    const price = rpad(fmtCurrency((item.price || 0) * (item.quantity || 1)), COL_PRICE);
    line(`${name} ${qty} ${price}`);
    if (item.note) line(`  * ${item.note}`);
  }

  // Totals
  line(divider("-", PW));
  add(...CMD.ALIGN_LEFT);
  line(tl("Subtotal", subtotal));
  if (showDiscount && discount > 0)  line(tl("Discount", `-${fmtCurrency(discount)}`));
  if (showTax      && taxAmount > 0) line(tl("Tax", taxAmount));
  add(...CMD.BOLD_ON, ...CMD.SIZE_DOUBLE_H);
  line(tl("TOTAL", total));
  add(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF);
  if (amountPaid > 0 && showPaid) line(tl("Paid", amountPaid));
  if (amountPaid > 0 && showDue)  line(tl("Change", change));
  if (paymentMethod)               line(tl("Method", paymentMethod.toUpperCase()));

  // Note to customer
  if (showNote && noteText) {
    add(...CMD.ALIGN_CENTER);
    line(noteText);
  }

  // Footer
  add(...CMD.ALIGN_CENTER);
  line(divider("="));
  line(printedFooter);
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
    const token = localStorage.getItem("print_bridge_token") || "posx-bridge-2025";

    let usbPrinter = printerConfig.printer || null;
    let networkPrinter = null;
    if (!usbPrinter) {
      try {
        const saved = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
        const matched = saved.filter((x) => x.type === type);
        usbPrinter = matched.find((x) => x.mode === "usb") || null;
        if (!usbPrinter) networkPrinter = matched.find((x) => x.mode === "network" && x.ip_address) || null;
      } catch (_) {}
    }

    const printerIp   = printerConfig.ip   || networkPrinter?.ip_address || "";
    const printerPort = printerConfig.port || networkPrinter?.port || 9100;

    if (usbPrinter) {
      if (!bridgeUrl) throw new Error("Set a Bridge URL in Terminal Settings → Printers");
      const printerName = (usbPrinter.windows_printer_name || usbPrinter.name || "").trim();
      if (!printerName) throw new Error("USB printer has no system name — open Terminal Settings → Printers and edit it");
      const res = await fetch(`${bridgeUrl}/print-usb`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bridge-Token": token },
        body: JSON.stringify({ printer_name: printerName, data: bytes }),
        signal: AbortSignal.timeout(15000),
      });
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
