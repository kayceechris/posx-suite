#!/usr/bin/env python3
"""
POSx Suite Local Print Bridge v3.0
Connects to the POSx backend via WebSocket relay — works from any browser,
any device, any network. No cert setup, no Chrome flags required.

Setup:
  1. Edit relay.conf: set BACKEND_URL to your Render backend URL
  2. Double-click start.bat
  3. Done — the bridge registers itself with the backend automatically.
     Printing works from any browser on any device.
"""
import datetime
import ipaddress
import json
import os
import socket
import ssl
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

try:
    import win32print
    _HAS_WIN32PRINT = True
except ImportError:
    _HAS_WIN32PRINT = False

PORT         = 8765
SECRET_TOKEN = "posx-bridge-2025"   # must match bridge token in POSx app

_BRIDGE_DIR  = os.path.dirname(os.path.abspath(__file__))
_CERT_FILE   = os.path.join(_BRIDGE_DIR, "bridge.crt")
_KEY_FILE    = os.path.join(_BRIDGE_DIR, "bridge.key")


# ── HTTPS via mkcert (trusted) ─────────────────────────────────────────────────

def _setup_mkcert_https(local_ip: str) -> bool:
    """Use mkcert.exe (if present) to generate a CA-signed trusted cert.
    Returns True if bridge.crt + bridge.key are ready to use."""
    mkcert = os.path.join(_BRIDGE_DIR, "mkcert.exe")
    if not os.path.exists(mkcert):
        return False

    if os.path.exists(_CERT_FILE) and os.path.exists(_KEY_FILE):
        print("  [mkcert] Certs already exist, using existing.")
        return True

    print("  [mkcert] Installing local CA (may prompt for admin)...")
    try:
        subprocess.run([mkcert, "-install"], check=True, capture_output=True, text=True, timeout=30)
        print(f"  [mkcert] Generating cert for {local_ip}...")
        subprocess.run(
            [mkcert, "-cert-file", _CERT_FILE, "-key-file", _KEY_FILE,
             local_ip, "localhost", "127.0.0.1"],
            check=True, capture_output=True, text=True, timeout=30,
        )
        return True
    except Exception as e:
        print(f"  [!] mkcert setup failed: {e}")
        return False


def _mkcert_caroot() -> str:
    mkcert = os.path.join(_BRIDGE_DIR, "mkcert.exe")
    try:
        r = subprocess.run([mkcert, "-CAROOT"], capture_output=True, text=True, timeout=10)
        return r.stdout.strip()
    except Exception:
        return ""


# ── HTTPS self-signed cert (fallback, not trusted by JS fetch) ─────────────────

def _generate_cert(local_ip: str) -> bool:
    """Generate a self-signed TLS cert valid for local_ip and localhost."""
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "POSx Print Bridge")])
        san_ips = [ipaddress.IPv4Address("127.0.0.1")]
        try:
            san_ips.append(ipaddress.IPv4Address(local_ip))
        except Exception:
            pass

        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.datetime.now(datetime.timezone.utc))
            .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=3650))
            .add_extension(
                x509.SubjectAlternativeName([x509.IPAddress(ip) for ip in san_ips]),
                critical=False,
            )
            .sign(key, hashes.SHA256())
        )

        with open(_KEY_FILE, "wb") as f:
            f.write(key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.TraditionalOpenSSL,
                serialization.NoEncryption(),
            ))
        with open(_CERT_FILE, "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))

        print("  [SSL] Self-signed cert generated.")
        return True
    except Exception as e:
        print(f"  [!] SSL cert generation failed: {e}")
        return False


def _ensure_https(local_ip: str):
    """Return an ssl.SSLContext if HTTPS can be set up, else None."""
    if not (os.path.exists(_CERT_FILE) and os.path.exists(_KEY_FILE)):
        if not _generate_cert(local_ip):
            return None
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(_CERT_FILE, _KEY_FILE)
        return ctx
    except Exception as e:
        print(f"  [!] SSL setup failed: {e}")
        return None


# ── Windows raw print via spooler ──────────────────────────────────────────────

def _raw_print_windows(printer_name: str, raw_bytes: bytes) -> None:
    """Send raw ESC/POS bytes to a named Windows printer.
    Method 1: win32print (pywin32) — most reliable
    Method 2: ctypes winspool — no extra packages needed
    Method 3: copy /b to printer port — last resort
    """
    last_error = ""

    # ── Method 1: win32print (pywin32) ───────────────────────────────────────
    if _HAS_WIN32PRINT:
        try:
            hPrinter = win32print.OpenPrinter(printer_name)
            try:
                hJob = win32print.StartDocPrinter(hPrinter, 1, ("Receipt", None, "RAW"))
                try:
                    win32print.StartPagePrinter(hPrinter)
                    win32print.WritePrinter(hPrinter, raw_bytes)
                    win32print.EndPagePrinter(hPrinter)
                finally:
                    win32print.EndDocPrinter(hPrinter)
            finally:
                win32print.ClosePrinter(hPrinter)
            print(f"  [OK] win32print: {len(raw_bytes)} bytes -> '{printer_name}'")
            return
        except Exception as e:
            last_error = f"win32print: {e}"
            print(f"  [!] win32print failed: {e}")

    # ── Method 2: ctypes winspool ────────────────────────────────────────────
    import ctypes
    try:
        class DOC_INFO_1(ctypes.Structure):
            _fields_ = [
                ("pDocName",    ctypes.c_wchar_p),
                ("pOutputFile", ctypes.c_wchar_p),
                ("pDatatype",   ctypes.c_wchar_p),
            ]
        winspool = ctypes.WinDLL("winspool.drv", use_last_error=True)
        handle   = ctypes.c_void_p()
        ok = winspool.OpenPrinterW(printer_name, ctypes.byref(handle), None)
        if not ok or not handle.value:
            raise OSError(f"OpenPrinter failed (code {ctypes.get_last_error()})")
        doc    = DOC_INFO_1("Receipt", None, "RAW")
        job_id = winspool.StartDocPrinterW(handle, 1, ctypes.byref(doc))
        if not job_id:
            winspool.ClosePrinter(handle)
            raise OSError(f"StartDocPrinter failed (code {ctypes.get_last_error()})")
        winspool.StartPagePrinter(handle)
        buf     = ctypes.create_string_buffer(raw_bytes, len(raw_bytes))
        written = ctypes.c_ulong(0)
        ok      = winspool.WritePrinter(handle, buf, len(raw_bytes), ctypes.byref(written))
        winspool.EndPagePrinter(handle)
        winspool.EndDocPrinter(handle)
        winspool.ClosePrinter(handle)
        if ok and written.value > 0:
            print(f"  [OK] ctypes: {written.value} bytes -> '{printer_name}'")
            return
        raise OSError(f"WritePrinter wrote {written.value}/{len(raw_bytes)} bytes")
    except Exception as e:
        err2 = str(e)
        last_error = (last_error + " | " if last_error else "") + f"ctypes: {err2}"
        print(f"  [!] ctypes failed: {err2}")

    # ── Method 3: copy /b to printer port ────────────────────────────────────
    import tempfile, os
    try:
        r = subprocess.run(
            ["wmic", "printer", "where", f"Name='{printer_name}'", "get", "PortName", "/value"],
            capture_output=True, text=True, timeout=8,
        )
        port = ""
        for line in r.stdout.splitlines():
            if line.strip().upper().startswith("PORTNAME="):
                port = line.strip().split("=", 1)[1].strip()
                break
        if not port:
            raise OSError("Port not found via wmic")
        with tempfile.NamedTemporaryFile(delete=False, suffix=".prn", mode="wb") as f:
            f.write(raw_bytes)
            tmp = f.name
        try:
            r = subprocess.run(
                ["cmd", "/c", "copy", "/b", tmp, f"\\\\.\\{port}"],
                capture_output=True, text=True, timeout=15,
            )
            if r.returncode != 0:
                raise OSError(r.stderr.strip() or r.stdout.strip() or "copy /b failed")
            print(f"  [OK] copy/b: {len(raw_bytes)} bytes -> {port}")
            return
        finally:
            try: os.unlink(tmp)
            except Exception: pass
    except Exception as e:
        raise OSError(f"All methods failed — {last_error} | port: {e}")


# ── Networking helpers ─────────────────────────────────────────────────────────

def _local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def _scan_network(port=9100, timeout=0.4):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        return []

    subnet = ".".join(local_ip.split(".")[:3])
    found, lock = [], threading.Lock()

    def check(ip):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            if sock.connect_ex((ip, port)) == 0:
                with lock:
                    found.append(ip)
            sock.close()
        except Exception:
            pass

    threads = [threading.Thread(target=check, args=(f"{subnet}.{i}",), daemon=True) for i in range(1, 255)]
    for t in threads: t.start()
    for t in threads: t.join(timeout=timeout + 1)
    return sorted(found)


def _list_windows_printers():
    try:
        result = subprocess.run(
            ["wmic", "printer", "get", "Name,PortName"],
            capture_output=True, text=True, timeout=8,
        )
        lines = [l.rstrip() for l in result.stdout.splitlines() if l.strip()]
        if len(lines) < 2:
            return []
        header   = lines[0]
        name_col = header.index("Name")
        port_col = header.index("PortName") if "PortName" in header else None
        printers = []
        for row in lines[1:]:
            name = row[name_col:port_col].strip() if port_col else row[name_col:].strip()
            port = row[port_col:].strip() if port_col else ""
            if name:
                printers.append({"name": name, "port": port})
        return printers
    except Exception:
        return []


# ── Backend WebSocket relay ────────────────────────────────────────────────────

def _load_relay_conf():
    conf = os.path.join(_BRIDGE_DIR, "relay.conf")
    result = {"backend_url": "", "outlet_id": "default"}
    if not os.path.exists(conf):
        return result
    with open(conf) as f:
        for line in f:
            line = line.strip()
            if line.startswith("BACKEND_URL="):
                result["backend_url"] = line.split("=", 1)[1].strip()
            elif line.startswith("OUTLET_ID="):
                result["outlet_id"] = line.split("=", 1)[1].strip()
    return result


def _handle_relay_job(ws, message):
    try:
        job = json.loads(message)
    except Exception:
        return
    job_id  = job.get("job_id", "")
    jtype   = job.get("type", "network")
    try:
        if jtype == "ping":
            ip   = job.get("ip", "")
            port = int(job.get("port", 9100))
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3)
            result = sock.connect_ex((ip, port))
            sock.close()
            ok = result == 0
            ws.send(json.dumps({"job_id": job_id, "ok": ok, "error": None if ok else f"Cannot reach {ip}:{port}"}))
            print(f"  [Relay] Ping {ip}:{port} → {'OK' if ok else 'FAIL'}")
            return
        if jtype == "usb":
            printer_name = job.get("printer_name", "").strip()
            data = bytes(job.get("data", []))
            _raw_print_windows(printer_name, data)
            ws.send(json.dumps({"job_id": job_id, "ok": True}))
            print(f"  [Relay] USB print OK → '{printer_name}'")
        else:
            ip   = job.get("ip", "")
            port = int(job.get("port", 9100))
            data = bytes(job.get("data", []))
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(6)
            sock.connect((ip, port))
            sock.sendall(data)
            sock.close()
            ws.send(json.dumps({"job_id": job_id, "ok": True}))
            print(f"  [Relay] Network print OK → {ip}:{port}")
    except Exception as e:
        ws.send(json.dumps({"job_id": job_id, "ok": False, "error": str(e)}))
        print(f"  [Relay] Print error: {e}")


def _relay_loop(ws_url: str, outlet_id: str):
    try:
        import websocket as _ws_lib
    except ImportError:
        print("  [Relay] ERROR: websocket-client not installed.")
        print("  [Relay] Run:  pip install websocket-client")
        return

    while True:
        try:
            ws = _ws_lib.WebSocketApp(
                ws_url,
                on_open=lambda ws: print(f"  [Relay] Connected to backend (outlet: {outlet_id})"),
                on_message=_handle_relay_job,
                on_error=lambda ws, e: print(f"  [Relay] Error: {e}"),
                on_close=lambda ws, c, m: print(f"  [Relay] Disconnected — reconnecting in 5s..."),
            )
            ws.run_forever(ping_interval=30, ping_timeout=10)
        except Exception as e:
            print(f"  [Relay] Crashed: {e}")
        time.sleep(5)


def _keepalive_loop(backend_url: str):
    """Ping the backend via HTTP every 10 minutes to prevent Render free-tier spin-down."""
    import urllib.request
    ping_url = backend_url.rstrip("/") + "/api/ping"
    while True:
        time.sleep(10 * 60)
        try:
            urllib.request.urlopen(ping_url, timeout=10)
        except Exception:
            pass


def _start_relay(backend_url: str, outlet_id: str):
    ws_url = (
        backend_url
        .replace("https://", "wss://")
        .replace("http://", "ws://")
        .rstrip("/")
    )
    ws_url = f"{ws_url}/api/ws/bridge?outlet_id={outlet_id}&token={SECRET_TOKEN}"
    threading.Thread(target=_relay_loop,     args=(ws_url, outlet_id), daemon=True).start()
    threading.Thread(target=_keepalive_loop, args=(backend_url,),       daemon=True).start()
    return ws_url


# ── Firewall ───────────────────────────────────────────────────────────────────

def _ensure_firewall_rule():
    if sys.platform != "win32":
        return
    try:
        subprocess.run(
            [
                "netsh", "advfirewall", "firewall", "add", "rule",
                f"name=POSx Print Bridge port {PORT}",
                "protocol=TCP", "dir=in",
                f"localport={PORT}", "action=allow",
            ],
            capture_output=True, text=True, timeout=8,
        )
    except Exception:
        pass


# ── HTTP handler ───────────────────────────────────────────────────────────────

class PrintBridgeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_OPTIONS(self):
        self._send_cors(200)

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True, "service": "POSx Print Bridge", "version": "1.4", "win32print": _HAS_WIN32PRINT})
        elif self.path == "/printers":
            self._json(200, {"printers": _list_windows_printers()})
        elif self.path == "/scan":
            print("  [scan] Scanning subnet for printers on port 9100...")
            found = _scan_network()
            print(f"  [scan] Found: {found}")
            self._json(200, {"found": found})
        else:
            self._json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path not in ("/print", "/test-usb", "/print-usb"):
            self._json(404, {"error": "Not found"})
            return
        token = self.headers.get("X-Bridge-Token", "")
        if token != SECRET_TOKEN:
            self._json(401, {"error": "Unauthorized — wrong token"})
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length))
        except Exception:
            self._json(400, {"error": "Invalid JSON"})
            return

        if self.path == "/test-usb":
            printer_name = body.get("printer_name", "").strip()
            if not printer_name:
                self._json(400, {"error": "Missing 'printer_name'"})
                return
            try:
                r = subprocess.run(
                    ["wmic", "printer", "where", f"Name='{printer_name}'", "call", "PrintTestPage"],
                    capture_output=True, text=True, timeout=15,
                )
                ok = r.returncode == 0 or "ReturnValue = 0" in r.stdout
                if ok:
                    print(f"  [OK] USB test page sent to '{printer_name}'")
                    self._json(200, {"ok": True})
                else:
                    err = (r.stderr or r.stdout).strip() or "Printer not found or unavailable"
                    self._json(502, {"error": err})
            except Exception as e:
                self._json(500, {"error": str(e)})
            return

        if self.path == "/print-usb":
            printer_name = body.get("printer_name", "").strip()
            data         = body.get("data", [])
            if not printer_name or not data:
                self._json(400, {"error": "Missing 'printer_name' or 'data'"})
                return
            try:
                _raw_print_windows(printer_name, bytes(data))
                print(f"  [OK] USB raw print {len(data)} bytes -> '{printer_name}'")
                self._json(200, {"ok": True, "bytes": len(data)})
            except Exception as e:
                self._json(502, {"error": str(e)})
            return

        printer_ip   = body.get("ip", "")
        printer_port = int(body.get("port", 9100))
        data         = body.get("data", [])
        if not printer_ip or not data:
            self._json(400, {"error": "Missing 'ip' or 'data'"})
            return
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(6)
            sock.connect((printer_ip, printer_port))
            sock.sendall(bytes(data))
            sock.close()
            print(f"  [OK] Printed {len(data)} bytes -> {printer_ip}:{printer_port}")
            self._json(200, {"ok": True, "bytes": len(data)})
        except ConnectionRefusedError:
            self._json(503, {"error": f"Printer refused connection at {printer_ip}:{printer_port}"})
        except socket.timeout:
            self._json(504, {"error": f"Timeout connecting to {printer_ip}:{printer_port}"})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def _send_cors(self, status):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Bridge-Token, Access-Control-Request-Private-Network")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _json(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Bridge-Token")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        print(f"[{self.address_string()}] {fmt % args}")


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    local_ip = _local_ip()
    _ensure_firewall_rule()

    # ── Start WebSocket relay to backend ──────────────────────────────────────
    relay_conf = _load_relay_conf()
    relay_active = False
    if relay_conf["backend_url"]:
        _start_relay(relay_conf["backend_url"], relay_conf["outlet_id"])
        relay_active = True

    # ── Start local HTTPS server (fallback / direct mode) ─────────────────────
    server = HTTPServer(("0.0.0.0", PORT), PrintBridgeHandler)
    ssl_ctx = None
    _setup_mkcert_https(local_ip)
    if os.path.exists(_CERT_FILE) and os.path.exists(_KEY_FILE):
        try:
            ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ssl_ctx.load_cert_chain(_CERT_FILE, _KEY_FILE)
            server.socket = ssl_ctx.wrap_socket(server.socket, server_side=True)
        except Exception as e:
            print(f"  [!] SSL load failed ({e}), falling back to HTTP")
            ssl_ctx = None

    protocol  = "https" if ssl_ctx else "http"
    local_url = f"{protocol}://{local_ip}:{PORT}"

    print("=" * 65)
    print("  POSx Suite Local Print Bridge v3.0")
    print("=" * 65)
    if relay_active:
        print(f"  Relay Mode    : ENABLED")
        print(f"  Backend URL   : {relay_conf['backend_url']}")
        print(f"  Outlet ID     : {relay_conf['outlet_id']}")
        print(f"  -> Connecting to backend... (check above for [Relay] Connected)")
        print()
        print("  Printing works from ANY browser on ANY device — no setup needed.")
    else:
        print(f"  Relay Mode    : DISABLED (relay.conf not configured)")
        print(f"  -> Edit relay.conf and set BACKEND_URL to enable relay mode.")
        print()
        print(f"  Local URL     : {local_url}")
    print()
    print("  Press Ctrl+C to stop")
    print("=" * 65)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Bridge stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
