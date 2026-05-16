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
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 8765
SECRET_TOKEN = "posx-bridge-2025"  # Change this in production!


class PrintBridgeHandler(BaseHTTPRequestHandler):

    # ── CORS preflight ────────────────────────────────────────────────────────
    def do_OPTIONS(self):
        self._send_cors(200)

    # ── Health check ──────────────────────────────────────────────────────────
    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True, "service": "POSx Print Bridge", "version": "1.0"})
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
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Bridge-Token")
        self.end_headers()

    def _json(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Bridge-Token")
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
