#!/usr/bin/env python3
"""
POSx Suite Local Print Bridge
- Run this on any Windows PC / mini PC on the same Wi-Fi as your printers
- The React app sends print jobs here via HTTP
- This service forwards raw ESC/POS bytes directly to the printer via TCP port 9100
- No pip packages needed — uses Python standard library only
"""
import json
import socket
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 8765
SECRET_TOKEN = "posx-bridge-2025"  # Change this in production!


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


class PrintBridgeHandler(BaseHTTPRequestHandler):

    # ── CORS preflight ────────────────────────────────────────────────────────
    def do_OPTIONS(self):
        self._send_cors(200)

    # ── Health check / Printer list ───────────────────────────────────────────
    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True, "service": "POSx Print Bridge", "version": "1.0"})
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

        # Auth
        token = self.headers.get("X-Bridge-Token", "")
        if token != SECRET_TOKEN:
            self._json(401, {"error": "Unauthorized — wrong token"})
            return

        # Parse body
        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length))
        except Exception:
            self._json(400, {"error": "Invalid JSON"})
            return

        printer_ip   = body.get("ip", "")
        printer_port = int(body.get("port", 9100))
        data         = body.get("data", [])   # list of ints (ESC/POS bytes)

        if not printer_ip or not data:
            self._json(400, {"error": "Missing 'ip' or 'data'"})
            return

        # Send to printer
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
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Bridge-Token")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        print(f"[{self.address_string()}] {fmt % args}")


def main():
    print("=" * 50)
    print("  POSx Suite Local Print Bridge v1.0")
    print("=" * 50)
    print(f"  Listening on  : http://0.0.0.0:{PORT}")
    print(f"  Health check  : http://localhost:{PORT}/health")
    print(f"  Printer list  : http://localhost:{PORT}/printers")
    print(f"  Network scan  : http://localhost:{PORT}/scan")
    print(f"  Print endpoint: http://localhost:{PORT}/print")
    print(f"  Auth token    : {SECRET_TOKEN}")
    print()

    # Show local IP addresses so the user knows what to put in the app
    try:
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        print(f"  Your local IP : http://{local_ip}:{PORT}")
        print(f"  → Use this URL in the POSx app printer settings")
    except Exception:
        pass

    print()
    print("  Press Ctrl+C to stop")
    print("=" * 50)

    server = HTTPServer(("0.0.0.0", PORT), PrintBridgeHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Bridge stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
