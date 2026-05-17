#!/usr/bin/env python3
"""
POSx Suite Local Print Bridge
- Run this on any Windows PC / mini PC on the same Wi-Fi as your printers
- The React app sends print jobs here via HTTP (or HTTPS if cert.pem/key.pem present)
- This service forwards raw ESC/POS bytes directly to the printer via TCP port 9100
- No pip packages needed — uses Python standard library only

HTTPS SETUP (fixes Chrome mixed-content block from HTTPS app):
  1. Run:  openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 3650 -nodes -subj "/CN=POSx-Bridge"
  2. Place cert.pem and key.pem in the same folder as bridge.py
  3. Bridge auto-detects and switches to HTTPS
  4. Visit https://<your-ip>:8765/health in the phone browser and accept the cert warning once
  5. Use https://<your-ip>:8765 as the Bridge URL in the POSx app
"""
import json
import os
import socket
import ssl
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 8765
SECRET_TOKEN = "posx-bridge-2025"  # Change this in production!

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CERT_FILE   = os.path.join(SCRIPT_DIR, "cert.pem")
KEY_FILE    = os.path.join(SCRIPT_DIR, "key.pem")


# ── Firewall ──────────────────────────────────────────────────────────────────

def _ensure_firewall_rule():
    """Try to add a Windows Firewall inbound rule for PORT so phones can reach the bridge."""
    if sys.platform != "win32":
        return
    try:
        result = subprocess.run(
            [
                "netsh", "advfirewall", "firewall", "add", "rule",
                f"name=POSx Print Bridge port {PORT}",
                "protocol=TCP",
                "dir=in",
                f"localport={PORT}",
                "action=allow",
            ],
            capture_output=True, text=True, timeout=8,
        )
        if result.returncode == 0:
            print(f"  ✓ Windows Firewall rule added for port {PORT}")
        # If it already exists (returncode 1 / "rule exists") that's fine too
    except FileNotFoundError:
        pass  # Not Windows or netsh not available
    except Exception:
        pass


# ── SSL ───────────────────────────────────────────────────────────────────────

def _wrap_ssl(server):
    """Wrap the server socket with TLS if cert.pem / key.pem exist."""
    if not (os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE)):
        return False
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)
        server.socket = ctx.wrap_socket(server.socket, server_side=True)
        return True
    except Exception as e:
        print(f"  ⚠ SSL setup failed: {e} — running HTTP instead")
        return False


# ── Network helpers ───────────────────────────────────────────────────────────

def _local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "unknown"


def _scan_network(port=9100, timeout=0.4):
    """Scan the local /24 subnet for devices listening on port (thermal printers use 9100)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        return []

    subnet = ".".join(local_ip.split(".")[:3])
    found = []
    lock = threading.Lock()

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
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=timeout + 1)

    return sorted(found)


def _list_windows_printers():
    """Return installed Windows printers via wmic."""
    try:
        result = subprocess.run(
            ["wmic", "printer", "get", "Name,PortName"],
            capture_output=True, text=True, timeout=8,
        )
        lines = [l.rstrip() for l in result.stdout.splitlines() if l.strip()]
        if len(lines) < 2:
            return []
        header = lines[0]
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


# ── HTTP handler ──────────────────────────────────────────────────────────────

class PrintBridgeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # Required for Chrome PNA preflight

    # ── CORS preflight ────────────────────────────────────────────────────────
    def do_OPTIONS(self):
        self._send_cors(200)

    # ── Health check / Printer list ───────────────────────────────────────────
    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True, "service": "POSx Print Bridge", "version": "1.1"})
        elif self.path == "/printers":
            self._json(200, {"printers": _list_windows_printers()})
        elif self.path == "/scan":
            print("  [scan] Scanning subnet for printers on port 9100...")
            found = _scan_network()
            print(f"  [scan] Found: {found}")
            self._json(200, {"found": found})
        else:
            self._json(404, {"error": "Not found"})

    # ── Print job ─────────────────────────────────────────────────────────────
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

    # ── Helpers ───────────────────────────────────────────────────────────────
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


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    # 1. Try to open Windows Firewall for this port
    _ensure_firewall_rule()

    # 2. Start server
    server = HTTPServer(("0.0.0.0", PORT), PrintBridgeHandler)
    is_https = _wrap_ssl(server)
    proto = "https" if is_https else "http"
    local_ip = _local_ip()

    print("=" * 55)
    print("  POSx Suite Local Print Bridge v1.1")
    print("=" * 55)
    print(f"  Protocol      : {'HTTPS ✓' if is_https else 'HTTP (no cert found)'}")
    print(f"  Listening on  : {proto}://0.0.0.0:{PORT}")
    print(f"  Your local IP : {proto}://{local_ip}:{PORT}")
    print(f"  → Use this URL in the POSx app Bridge URL field")
    print()
    print(f"  Health check  : {proto}://localhost:{PORT}/health")
    print(f"  Printer scan  : {proto}://localhost:{PORT}/scan")
    print(f"  Print endpoint: {proto}://localhost:{PORT}/print")
    print(f"  Auth token    : {SECRET_TOKEN}")
    print()

    if not is_https:
        print("  ⚠ Running HTTP — Chrome may block requests from the HTTPS app.")
        print("  To enable HTTPS (recommended for mobile scanning):")
        print("    openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem \\")
        print("      -days 3650 -nodes -subj \"/CN=POSx-Bridge\"")
        print("  Then place cert.pem + key.pem next to bridge.py and restart.")
        print()

    if sys.platform == "win32":
        print("  If phone can't reach bridge, allow port in Windows Firewall:")
        print(f"    netsh advfirewall firewall add rule name=\"POSx Bridge\" protocol=TCP dir=in localport={PORT} action=allow")
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
