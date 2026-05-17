#!/usr/bin/env python3
"""
POSx Suite Local Print Bridge v1.3
- Run this on any Windows PC on the same Wi-Fi as your printers.
- Serves plain HTTP — Chrome's Private Network Access headers handle security.
- No pip packages needed — uses Python standard library only.

Setup:
  1. Double-click start.bat (or run: python bridge.py)
  2. Note the IP shown and enter it in the POSx app Bridge URL field.
  3. Add printers in Terminal Settings -> Printers tab.
"""
import json
import socket
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT         = 8765
SECRET_TOKEN = "posx-bridge-2025"   # must match bridge token in POSx app


# ── Windows raw print via spooler ──────────────────────────────────────────────

def _raw_print_windows(printer_name: str, raw_bytes: bytes) -> None:
    """Send raw ESC/POS bytes to a named Windows printer.
    Tries two methods in order:
      1. Windows spooler API via ctypes (clean, works with most drivers)
      2. Direct port write via 'copy /b' (fallback for stubborn drivers)
    """
    import ctypes, tempfile, os

    last_error = ""

    # ── Method 1: spooler API ────────────────────────────────────────────────
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
            print(f"  [OK] Spooler: {written.value} bytes -> '{printer_name}'")
            return
        last_error = f"WritePrinter wrote {written.value}/{len(raw_bytes)} bytes"
    except Exception as e:
        last_error = str(e)
        print(f"  [!] Spooler method failed: {e}")

    # ── Method 2: direct port write via copy /b ──────────────────────────────
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
            raise OSError(f"Could not find port for printer '{printer_name}'")

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
            print(f"  [OK] Port write: {len(raw_bytes)} bytes -> {port} ('{printer_name}')")
            return
        finally:
            try: os.unlink(tmp)
            except Exception: pass
    except Exception as e:
        raise OSError(f"Both print methods failed. Spooler: {last_error} | Port: {e}")


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
            self._json(200, {"ok": True, "service": "POSx Print Bridge", "version": "1.3"})
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

    server = HTTPServer(("0.0.0.0", PORT), PrintBridgeHandler)

    print("=" * 55)
    print("  POSx Suite Local Print Bridge v1.3")
    print("=" * 55)
    print(f"  Protocol      : HTTP")
    print(f"  Your local IP : http://{local_ip}:{PORT}")
    print(f"  -> Use this URL in the POSx app Bridge URL field")
    print()
    print(f"  Localhost URL : http://localhost:{PORT}")
    print(f"  -> Use this if the app runs on this same PC")
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
