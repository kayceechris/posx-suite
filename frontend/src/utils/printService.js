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
  const decimals = n % 1 === 0 ? 0 : 2;
  const formatted = n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${sym}${formatted}`;
}

function divider(char = "-", len = 32) {
  return char.repeat(len);
}

// Cache logo bytes so re-fetching the remote URL on every print is avoided.
const _logoCache = new Map();

// Convert a logo image URL into ESC/POS raster bytes (GS v 0). The image is
// fetched as a blob (CORS-safe, never taints the canvas), drawn onto a
// canvas sized to the paper width, alpha-blended onto white, then dithered
// to 1-bit with Floyd–Steinberg so logos and photos look like actual B&W
// rather than a hard cut-off blob. Returns [] when no URL or when the
// image fails to load — a missing logo must never break a print.
async function loadLogoBytes(logoUrl, paper80mm = true) {
  if (!logoUrl) return [];
  const cacheKey = `${logoUrl}::${paper80mm}`;
  if (_logoCache.has(cacheKey)) return _logoCache.get(cacheKey);

  // Load the bitmap. Fetching as a blob → object URL means the resulting
  // <img> is treated as same-origin, so getImageData works even on cross-
  // origin sources (Vercel frontend pulling logos from a Render backend
  // that doesn't reliably echo CORS headers on the image route).
  let blobUrl = null;
  let img = null;
  try {
    const resp = await fetch(logoUrl, { mode: "cors", credentials: "omit" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    blobUrl = URL.createObjectURL(blob);
    img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("decode failed"));
      i.src = blobUrl;
    });
  } catch (e) {
    // Last-ditch: try direct load. May still taint the canvas; in that
    // case getImageData throws below and we return [].
    try {
      img = await new Promise((res, rej) => {
        const i = new Image();
        i.crossOrigin = "anonymous";
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("direct load failed"));
        i.src = logoUrl;
      });
    } catch (_) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      console.warn("[printService] logo fetch failed:", logoUrl, e?.message);
      return [];
    }
  }

  try {
    const targetWidth = paper80mm ? 384 : 384; // both rolls = 384 dots
    const widthBytes = Math.ceil(targetWidth / 8);
    const actualWidth = widthBytes * 8;
    const scale = actualWidth / img.width;
    const targetHeight = Math.min(240, Math.max(40, Math.round(img.height * scale)));

    const canvas = document.createElement("canvas");
    canvas.width = actualWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, actualWidth, targetHeight);
    ctx.drawImage(img, 0, 0, actualWidth, targetHeight);

    const imageData = ctx.getImageData(0, 0, actualWidth, targetHeight);
    const data = imageData.data;
    const W = actualWidth, H = targetHeight;

    // Flatten to grayscale (alpha-composited onto white), apply a gamma /
    // contrast curve that pulls midtones toward black, then dither.
    // Thermal heads under-burn — a "neutral" 128 grey prints as faint gray
    // and the logo looks washed out. Squashing the curve below 200 toward
    // 0 makes mid-greys reliably print dark.
    const lum = new Float32Array(W * H);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const a = data[i + 3] / 255;
      const r = data[i]     * a + 255 * (1 - a);
      const g = data[i + 1] * a + 255 * (1 - a);
      const b = data[i + 2] * a + 255 * (1 - a);
      // Rec. 601 luma
      let v = 0.299 * r + 0.587 * g + 0.114 * b;
      // Steepen midtones: values < 200 darken aggressively, values >= 200
      // stay white. This makes line-art logos print bold and dark while
      // photos still keep their highlights.
      if (v < 200) v = v * 0.55; else v = 255;
      lum[p] = v;
    }

    // Floyd–Steinberg dithering against a slightly elevated threshold so
    // anything ambiguous still tips toward black.
    const THRESH = 150;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const oldPix = lum[idx];
        const newPix = oldPix < THRESH ? 0 : 255;
        lum[idx] = newPix;
        const err = oldPix - newPix;
        if (x + 1 < W)             lum[idx + 1]         += err * 7 / 16;
        if (y + 1 < H) {
          if (x > 0)               lum[idx + W - 1]     += err * 3 / 16;
                                   lum[idx + W]         += err * 5 / 16;
          if (x + 1 < W)           lum[idx + W + 1]     += err * 1 / 16;
        }
      }
    }

    const bytes = [];
    bytes.push(0x1B, 0x61, 0x01);          // ESC a 1 — centre
    bytes.push(0x1D, 0x76, 0x30, 0x00);    // GS v 0  m=0 (normal)
    bytes.push(widthBytes & 0xFF, (widthBytes >> 8) & 0xFF);
    bytes.push(H & 0xFF, (H >> 8) & 0xFF);
    for (let y = 0; y < H; y++) {
      for (let bx = 0; bx < widthBytes; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (lum[y * W + x] < 128) byte |= (1 << (7 - bit));
        }
        bytes.push(byte);
      }
    }
    bytes.push(0x0A);                       // feed line
    bytes.push(0x1B, 0x61, 0x00);          // ESC a 0 — left
    _logoCache.set(cacheKey, bytes);
    return bytes;
  } catch (e) {
    console.warn("[printService] logo render failed:", e?.message);
    return [];
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}

// ─── ESC/POS receipt builder ─────────────────────────────────────────────────
function buildReceiptBytes(data) {
  const {
    businessName = "POSx Suite",
    address = "",
    phone = "",
    orderNo = "",
    tableName = "",
    floorName = "",
    waiter = "",
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
    orderDate = null,        // original order datetime — string or Date
    reprintAt = null,        // when set, render a 'REPRINT' banner with this timestamp
    layoutSettings = {},
    logoBytes = [],
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

  // Paper width: 80mm → 42 chars, 58mm → 32 chars. Default to 80mm.
  const PW   = S.paper_size === "58mm" ? 32 : 42;
  const is80 = PW === 42;
  // 80mm 4 cols: Item(16) Qty(3) UnitPrice(9) LineTotal(11) + 3 spaces = 42
  // 58mm 3 cols: Item(16) Qty(3) LineTotal(11)               + 2 spaces = 32
  const COL_ITEM   = 16;
  const COL_QTY    = 3;
  const COL_UPRICE = 9;
  const COL_TOTAL  = 11;

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

  // Logo (rendered above the business name when enabled and the image
  // resolved to raster bytes upstream)
  if (S.show_logo !== false && logoBytes.length) add(...logoBytes);

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

  // Reprint banner — distinct from the original receipt so customers /
  // auditors can tell at a glance this isn't the first copy. Shows the
  // exact moment the reprint was made.
  if (reprintAt) {
    const ts = (reprintAt instanceof Date) ? reprintAt : new Date(reprintAt);
    add(...CMD.ALIGN_CENTER, ...CMD.BOLD_ON);
    line("*** REPRINT ***");
    add(...CMD.BOLD_OFF);
    line(`Reprinted: ${ts.toLocaleString()}`);
  }
  line(divider("-", PW));

  // Order info
  add(...CMD.ALIGN_LEFT);
  if (showCustomer  && tableName) line(`Table  : ${tableName}`);
  if (showCustomer  && floorName) line(`Floor  : ${floorName}`);
  if (showReference && orderNo)   line(`Order  : ${orderNo}`);
  if (waiter)  line(`Waiter : ${waiter}`);
  if (cashier) line(`Cashier: ${cashier}`);
  if (showDate) {
    // Use the ORIGINAL order datetime when reprinting so the receipt
    // still reflects when the sale actually happened.
    const dateLine = orderDate
      ? new Date(orderDate).toLocaleString()
      : new Date().toLocaleString();
    line(`Date   : ${dateLine}`);
  }
  line(divider("-", PW));

  // Items — 80mm: 4 cols (Item, Qty, Unit Price, Line Total); 58mm: 3 cols (Item, Qty, Total)
  add(...CMD.ALIGN_LEFT);
  if (is80) {
    line(`${"ITEM".padEnd(COL_ITEM)} ${"QTY".padEnd(COL_QTY)} ${"PRICE".padStart(COL_UPRICE)} ${"TOTAL".padStart(COL_TOTAL)}`);
  } else {
    line(`${"ITEM".padEnd(COL_ITEM)} ${"QTY".padEnd(COL_QTY)} ${"TOTAL".padStart(COL_TOTAL)}`);
  }
  line(divider("-", PW));
  for (const item of items) {
    const name      = pad(item.name, COL_ITEM);
    const qty       = pad(`x${item.quantity}`, COL_QTY);
    // Use the item's stored total when present (matches whatever the
    // cart computed and saved on the order), and only fall back to
    // price × quantity when total is missing. This prevents a
    // qty-defaulted-to-1 bug from inflating a line that legitimately
    // had quantity=0, and keeps the receipt's items section adding up
    // to exactly what the printed Subtotal / TOTAL lines say.
    const lineValue = (item.total != null)
      ? Number(item.total)
      : (Number(item.price) || 0) * (Number(item.quantity) || 0);
    const unitPrice = rpad(fmtCurrency(item.price || 0), COL_UPRICE);
    const lineTotal = rpad(fmtCurrency(lineValue), COL_TOTAL);
    if (is80) {
      line(`${name} ${qty} ${unitPrice} ${lineTotal}`);
    } else {
      line(`${name} ${qty} ${lineTotal}`);
    }
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
  // Credit sales — make it unmistakable that this isn't a paid receipt
  // so the cashier doesn't confuse it for one and the customer signs
  // the right document. Banner sits below the totals.
  if ((paymentMethod || "").toLowerCase() === "credit") {
    add(...CMD.ALIGN_CENTER, ...CMD.BOLD_ON);
    line("");
    line("*** CREDIT — PAY LATER ***");
    line("Unpaid balance: " + fmtCurrency(total));
    add(...CMD.BOLD_OFF, ...CMD.ALIGN_LEFT);
  }

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
    waiterName = "",
  } = data;

  const b = [];
  const add = (...bytes) => b.push(...bytes);
  const line = (text) => { b.push(...enc(text)); b.push(0x0a); };

  const now = new Date();
  // Date + time on every docket so the kitchen / bar can tell at a glance
  // whether the ticket on the spike is from this service or a leftover
  // from earlier. ISO date keeps it unambiguous across regions; locale
  // time is fine since the format is universally readable.
  const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const timePart = now.toLocaleTimeString();

  add(...CMD.INIT);
  add(...CMD.ALIGN_CENTER, ...CMD.BOLD_ON, ...CMD.SIZE_DOUBLE_WH);
  line(station);
  add(...CMD.SIZE_DOUBLE_H);
  if (tableName) line(`TABLE: ${tableName}`);
  add(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF);
  if (waiterName) line(`Waiter: ${waiterName}`);
  line(`Order: ${orderNo}`);
  line(`${datePart}  ${timePart}`);
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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "https://posx-suite.onrender.com";

// Reprints (Held Orders, Orders admin, Reports) should always route to one
// designated thermal printer rather than the per-type heuristic. The name is
// matched case-insensitively against printer.name and windows_printer_name,
// and overridable via localStorage.pos_reprint_printer_name. Defaults to
// 'MP-POS80 4' per current venue setup.
export function pickReprintPrinter() {
  const wanted = (localStorage.getItem("pos_reprint_printer_name") || "MP-POS80 4")
    .toLowerCase().trim();
  if (!wanted) return null;
  try {
    const saved = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
    return saved.find((p) => {
      const n  = (p?.name || "").toLowerCase();
      const wn = (p?.windows_printer_name || "").toLowerCase();
      return n.includes(wanted) || wn.includes(wanted);
    }) || null;
  } catch {
    return null;
  }
}

function _authHeader() {
  const token = localStorage.getItem("posx_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Relay via backend WebSocket (permanent fix — no browser restrictions) ────
async function sendViaRelay({ type = "network", printerIp, printerPort = 9100, printerName, bytes }) {
  const user = JSON.parse(localStorage.getItem("posx_user") || "{}");
  const outlet_id = user.outlet_id || "default";
  const body = type === "usb"
    ? { type: "usb", printer_name: printerName, data: bytes, outlet_id }
    : { type: "network", ip: printerIp, port: printerPort, data: bytes, outlet_id };

  const res = await fetch(`${BACKEND_URL}/api/print-relay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ..._authHeader() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Relay error ${res.status}`);
  }
  return res.json();
}

// ─── Bridge URL helpers ───────────────────────────────────────────────────────
function _bridgeUrl() {
  const raw = (localStorage.getItem("print_bridge_url") || "").trim();
  const cleaned = raw.replace(/[).,\s]+$/, "").replace(/\/+$/, "");
  if (!cleaned) return null;
  // Reject obvious placeholders
  if (cleaned.includes(".x:") || cleaned === "http://192.168.1.x:8765") return null;
  return cleaned;
}

// ─── Direct-to-bridge print (LAN, works without internet) ─────────────────────
// Used as the primary path when a bridge URL is configured and the device
// is offline OR the cloud relay fails. Supports both USB (/print-usb) and
// network (/print) printers, matching the bridge.py endpoints.
async function sendToBridgeDirect({ type, printerName, printerIp, printerPort = 9100, bytes }) {
  const bridgeUrl = _bridgeUrl();
  if (!bridgeUrl) throw new Error("No bridge URL configured — set it in Settings → Print Bridge");
  const token = localStorage.getItem("print_bridge_token") || "posx-bridge-2025";
  const endpoint = type === "usb" ? "/print-usb" : "/print";
  const body = type === "usb"
    ? { printer_name: printerName, data: bytes }
    : { ip: printerIp, port: printerPort, data: bytes };
  const res = await fetch(`${bridgeUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bridge-Token": token,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Bridge error ${res.status}`);
  }
  return res.json();
}

// ─── Smart dispatcher: relay-first when online, bridge when offline ──────────
// Relay is reachable from ANY network (cell data, different wifi, etc) —
// only requires internet from the user's device. Bridge-direct only helps
// when the user is on the same LAN as the bridge PC, AND it costs an
// 8-second timeout when they aren't. So we prefer relay when there's
// internet, and only fall through to bridge-direct as the OFFLINE path.
//
// Order:
//   online              → relay (works from anywhere)
//   online + relay fail → bridge-direct (last-ditch, only if on same LAN)
//   offline             → bridge-direct (only thing that works)
async function dispatchPrint({ type, printerName, printerIp, printerPort, bytes }) {
  const bridgeUrl = _bridgeUrl();
  const online = (typeof navigator !== "undefined") ? navigator.onLine !== false : true;

  // Path A: offline + bridge configured → bridge only
  if (!online && bridgeUrl) {
    await sendToBridgeDirect({ type, printerName, printerIp, printerPort, bytes });
    return { method: "bridge-offline" };
  }

  // Path B: online → relay first. Works regardless of the user's network
  // (cellular, off-site wifi, etc) — the bridge PC connects OUTBOUND to
  // Render via WebSocket, so the bridge receives the request through the
  // cloud, no LAN access needed from the user.
  if (online) {
    try {
      if (type === "usb") {
        await sendViaRelay({ type: "usb", printerName, bytes });
      } else {
        await sendViaRelay({ type: "network", printerIp, printerPort, bytes });
      }
      return { method: "relay" };
    } catch (relayErr) {
      // Relay couldn't reach the bridge — maybe the bridge is down on the
      // cloud side. Fall through to bridge-direct as a last attempt; only
      // useful if the user happens to be on the same LAN.
      if (bridgeUrl) {
        try {
          await sendToBridgeDirect({ type, printerName, printerIp, printerPort, bytes });
          return { method: "bridge-fallback" };
        } catch (e) {
          console.warn(`[printService] relay AND bridge-direct both failed: ${relayErr.message} / ${e.message}`);
        }
      }
      throw relayErr;
    }
  }

  // Path C: offline + no bridge → nothing we can do.
  throw new Error("Cannot reach printer — no internet, no LAN bridge configured");
}

// ─── Bridge communication (legacy direct mode) ────────────────────────────────
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
  table { border-collapse: collapse; }
  th, td { padding: 2px 4px; font-size: 11px; vertical-align: top; }
  th { border-bottom: 1px solid #000; }
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
    floorName = "",
    waiter = "",
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
    docType = "RECEIPT",
    orderDate = null,
    reprintAt = null,
    layoutSettings = {},
    logoUrl = "",
  } = data;

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

  const twoCol = (lbl, val, style = "") =>
    `<div style="display:flex;justify-content:space-between;${style}"><span>${lbl}</span><span>${val}</span></div>`;

  const rows = items.map(i => {
    // Prefer the stored line total; only recompute when missing. See
    // matching comment in buildReceiptBytes — keeps the receipt's
    // items section consistent with what the cart actually saved.
    const lineTotal = (i.total != null)
      ? Number(i.total)
      : (Number(i.price) || 0) * (Number(i.quantity) || 0);
    return `<tr>
      <td>${i.name}${i.note ? `<br><small style="color:#666">* ${i.note}</small>` : ""}</td>
      <td class="center">x${i.quantity}</td>
      <td class="right">${fmtCurrency(i.price || 0)}</td>
      <td class="right">${fmtCurrency(lineTotal)}</td>
    </tr>`;
  }).join("");

  const showLogo = S.show_logo !== false;
  return `
    ${showLogo && logoUrl ? `<div class="center"><img src="${logoUrl}" alt="" style="max-height:90px;max-width:80%;object-fit:contain"/></div>` : ""}
    ${showStoreName ? `<div class="center bold big">${businessName}</div>` : ""}
    ${showAddress && address ? `<div class="center">${address}</div>` : ""}
    ${showPhone   && phone   ? `<div class="center">Tel: ${phone}</div>` : ""}
    ${printedHeader          ? `<div class="center">${printedHeader}</div>` : ""}
    <div class="divider"></div>
    <div class="center bold">${docType}</div>
    ${reprintAt ? `
      <div class="center bold" style="margin-top:4px">*** REPRINT ***</div>
      <div class="center" style="font-size:11px;color:#555">Reprinted: ${new Date(reprintAt).toLocaleString()}</div>
    ` : ""}
    <div class="divider"></div>
    ${showCustomer  && tableName ? `<div>Table  : ${tableName}</div>` : ""}
    ${showCustomer  && floorName ? `<div>Floor  : ${floorName}</div>` : ""}
    ${showReference && orderNo   ? `<div>Order  : ${orderNo}</div>` : ""}
    ${waiter  ? `<div>Waiter : ${waiter}</div>`  : ""}
    ${cashier ? `<div>Cashier: ${cashier}</div>` : ""}
    ${showDate                   ? `<div>Date   : ${orderDate ? new Date(orderDate).toLocaleString() : new Date().toLocaleString()}</div>` : ""}
    <div class="divider"></div>
    <table width="100%">
      <thead><tr><th style="text-align:left">Item</th><th class="center">Qty</th><th class="right">Price</th><th class="right">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="divider"></div>
    ${twoCol("Subtotal", fmtCurrency(subtotal))}
    ${showDiscount && discount > 0 ? twoCol("Discount", `-${fmtCurrency(discount)}`, "color:red") : ""}
    ${showTax && taxAmount > 0 ? twoCol("Tax", fmtCurrency(taxAmount)) : ""}
    <div class="divider"></div>
    ${twoCol("TOTAL", fmtCurrency(total), "font-weight:bold;font-size:16px")}
    ${amountPaid > 0 && showPaid ? twoCol("Paid", fmtCurrency(amountPaid)) : ""}
    ${amountPaid > 0 && showDue  ? twoCol("Change", fmtCurrency(change)) : ""}
    ${paymentMethod ? twoCol("Method", paymentMethod.toUpperCase()) : ""}
    ${(paymentMethod || "").toLowerCase() === "credit"
      ? `<div style="margin-top:4px;padding:4px;border:1px dashed #b45309;text-align:center;font-weight:bold;color:#b45309;">
           *** CREDIT — PAY LATER ***<br/>
           <span style="font-size:12px;font-weight:normal;">Unpaid balance: ${fmtCurrency(total)}</span>
         </div>`
      : ""}
    ${showNote && noteText ? `<div class="divider"></div><div class="center">${noteText}</div>` : ""}
    <div class="divider"></div>
    <div class="center">${printedFooter}</div>
  `;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export const printService = {
  /**
   * Test bridge connection. Returns true if reachable.
   */
  async testBridge(_bridgeUrl) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/print-relay/status`, {
        headers: _authHeader(),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data.connected === true;
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
    const ls = receiptData.layoutSettings || {};
    const wantLogo = ls.show_logo !== false && !!receiptData.logoUrl;
    const logoBytes = wantLogo
      ? await loadLogoBytes(receiptData.logoUrl, ls.paper_size !== "58mm")
      : [];
    const bytes = buildReceiptBytes({ ...receiptData, logoBytes });
    return this._print(bytes, { ...receiptData, logoBytes }, printerConfig, "receipt");
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
    // ── Explicit printerConfig takes full priority ────────────────────────────
    if (printerConfig.printer) {
      const printerName = (printerConfig.printer.windows_printer_name || printerConfig.printer.name || "").trim();
      if (!printerName) throw new Error("USB printer has no system name — open Terminal Settings → Printers and edit it");
      const result = await dispatchPrint({ type: "usb", printerName, bytes });
      return { success: true, ...result };
    }
    if (printerConfig.ip) {
      const result = await dispatchPrint({ type: "network", printerIp: printerConfig.ip, printerPort: printerConfig.port || 9100, bytes });
      return { success: true, ...result };
    }

    // ── Auto-discover from localStorage (receipt prints / fallback) ───────────
    let usbPrinter = null;
    let networkPrinter = null;
    try {
      const saved = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
      const matched = saved.filter((x) => x.type === type);
      usbPrinter = matched.find((x) => x.mode === "usb") || null;
      if (!usbPrinter) networkPrinter = matched.find((x) => x.mode === "network" && x.ip_address) || null;
    } catch (_) {}

    if (usbPrinter) {
      const printerName = (usbPrinter.windows_printer_name || usbPrinter.name || "").trim();
      if (!printerName) throw new Error("USB printer has no system name — open Terminal Settings → Printers and edit it");
      const result = await dispatchPrint({ type: "usb", printerName, bytes });
      return { success: true, ...result };
    }
    if (networkPrinter) {
      const result = await dispatchPrint({ type: "network", printerIp: networkPrinter.ip_address, printerPort: networkPrinter.port || 9100, bytes });
      return { success: true, ...result };
    }

    // ── No printer configured → browser fallback ─────────────────────────────
    if (!usbPrinter && !networkPrinter) {
      throw new Error("No printer configured — open Terminal Settings → Printers tab to add a printer");
    }

    // Browser fallback (only when no printer configured at all)
    console.warn("[PrintService] falling back to browser print");
    if (type === "receipt") {
      browserPrint(receiptToHtml(data));
    } else {
      window.print();
    }
    return { success: true, method: "browser" };
  },
};

export default printService;
