#!/usr/bin/env python3
"""
POSx Suite Local Print Bridge v1.2
- Run this on any Windows PC on the same Wi-Fi as your printers.
- Automatically generates an HTTPS certificate on first run.
- No pip packages needed — uses Python standard library only.

After first run:
  1. Open  https://<YOUR-PC-IP>:8765/health  in Chrome on your phone.
  2. Tap Advanced → Proceed (accept the self-signed cert once).
  3. Done — WiFi scanning now works from the POSx app.
"""
import json
import os
import socket
import ssl
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT        = 8765
SECRET_TOKEN = "posx-bridge-2025"   # must match bridge token in POSx app

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CERT_FILE   = os.path.join(SCRIPT_DIR, "cert.pem")
KEY_FILE    = os.path.join(SCRIPT_DIR, "key.pem")


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


# ── Certificate generation ─────────────────────────────────────────────────────

def _cert_has_ip(local_ip):
    """Return True if the existing cert.pem already includes local_ip in its SAN."""
    if not os.path.exists(CERT_FILE):
        return False
    try:
        openssl = _find_openssl()
        if not openssl:
            return True  # can't check, assume it's fine
        result = subprocess.run(
            [openssl, "x509", "-in", CERT_FILE, "-noout", "-text"],
            capture_output=True, text=True, timeout=8,
        )
        return local_ip in result.stdout
    except Exception:
        return True  # assume fine


def _find_openssl():
    """Return path to openssl executable, or None."""
    candidates = ["openssl"]
    if sys.platform == "win32":
        candidates += [
            r"C:\Program Files\Git\usr\bin\openssl.exe",
            r"C:\Program Files (x86)\Git\usr\bin\openssl.exe",
            r"C:\Windows\System32\openssl.exe",
        ]
    for cmd in candidates:
        try:
            subprocess.run([cmd, "version"], capture_output=True, timeout=4, check=True)
            return cmd
        except Exception:
            continue
    return None


def _gen_cert(local_ip):
    """Generate a self-signed cert with local_ip in the SAN. Returns True on success."""
    openssl = _find_openssl()
    if not openssl:
        return False
    san = f"IP:{local_ip},IP:127.0.0.1,DNS:localhost"
    try:
        result = subprocess.run(
            [
                openssl, "req", "-x509",
                "-newkey", "rsa:2048",
                "-keyout", KEY_FILE,
                "-out",    CERT_FILE,
                "-days",   "3650",
                "-nodes",
                "-subj",   "/CN=POSx-Bridge",
                "-addext", f"subjectAltName={san}",
            ],
            capture_output=True, timeout=30,
        )
        return result.returncode == 0
    except Exception:
        return False


def _ensure_cert(local_ip):
    """Generate cert if missing or if local_ip changed since last generation."""
    if _cert_has_ip(local_ip):
        return  # cert already good
    print(f"  Generating HTTPS certificate for {local_ip}...")
    if _gen_cert(local_ip):
        print("  [OK] Certificate ready (cert.pem + key.pem)")
    else:
        print("  [!!] Could not generate certificate -- running HTTP.")
        print("       Install Git (includes openssl) then restart, or run manually:")
        print(f'       openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 3650 -nodes -subj "/CN=POSx-Bridge" -addext "subjectAltName=IP:{local_ip},IP:127.0.0.1,DNS:localhost"')


def _wrap_ssl(server):
    """Wrap the HTTPServer socket with TLS. Returns True if successful."""
    if not (os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE)):
        return False
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)
        server.socket = ctx.wrap_socket(server.socket, server_side=True)
        return True
    except Exception as e:
        print(f"  [!!] SSL error: {e} -- falling back to HTTP.")
        return False


# ── Firewall ───────────────────────────────────────────────────────────────────

def _ensure_firewall_rule():
    if sys.platform != "win32":
        return
    try:
        result = subprocess.run(
            [
                "netsh", "advfirewall", "firewall", "add", "rule",
                f"name=POSx Print Bridge port {PORT}",
                "protocol=TCP", "dir=in",
                f"localport={PORT}", "action=allow",
            ],
            capture_output=True, text=True, timeout=8,
        )
        if result.returncode == 0:
            print(f"  [OK] Windows Firewall rule added for port {PORT}")
    except Exception:
        pass


# ── HTTP handler ───────────────────────────────────────────────────────────────

class PrintBridgeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_OPTIONS(self):
        self._send_cors(200)

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True, "service": "POSx Print Bridge", "version": "1.2"})
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
        if self.path != "/print":
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
            print(f"  ✓ Printed {len(data)} bytes → {printer_ip}:{printer_port}")
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
    _ensure_cert(local_ip)

    server   = HTTPServer(("0.0.0.0", PORT), PrintBridgeHandler)
    is_https = _wrap_ssl(server)
    proto    = "https" if is_https else "http"

    print("=" * 55)
    print("  POSx Suite Local Print Bridge v1.2")
    print("=" * 55)
    print(f"  Protocol      : {'HTTPS [OK]' if is_https else 'HTTP (cert generation failed)'}")
    print(f"  Your local IP : {proto}://{local_ip}:{PORT}")
    print(f"  -> Use this URL in the POSx app Bridge URL field")
    print()

    if is_https:
        print("  --- One-time phone setup (do this once) ----------")
        print(f"  1. Open  {proto}://{local_ip}:{PORT}/health  in Chrome on your phone")
        print("  2. Tap  Advanced -> Proceed  (accept the self-signed cert)")
        print("  3. Done -- WiFi scanning will now work in the POSx app")
        print()

    print("  Press Ctrl+C to stop")
    print("=" * 55)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Bridge stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
