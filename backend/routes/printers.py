import asyncio
import datetime
import socket
import subprocess
import sys

from fastapi import APIRouter, HTTPException, Depends

from database import db
from models import User, Printer, PrinterCreate
from auth import get_current_user

router = APIRouter(prefix="/api")


def _list_windows_printers() -> list[dict]:
    """Return printers installed on the local Windows machine via wmic."""
    if sys.platform != "win32":
        return []
    try:
        result = subprocess.run(
            ["wmic", "printer", "get", "Name,PortName,DriverName"],
            capture_output=True, text=True, timeout=8,
        )
        lines = [l.rstrip() for l in result.stdout.splitlines() if l.strip()]
        if not lines:
            return []
        # First non-empty line is the header: Name  PortName  DriverName
        # Subsequent lines are data rows with fixed-width columns
        header = lines[0]
        name_col = header.index("Name")
        port_col = header.index("PortName") if "PortName" in header else None
        driver_col = header.index("DriverName") if "DriverName" in header else None
        printers = []
        for row in lines[1:]:
            if not row.strip():
                continue
            name = row[name_col:port_col].strip() if port_col else row[name_col:].strip()
            port = row[port_col:driver_col].strip() if (port_col and driver_col) else ""
            driver = row[driver_col:].strip() if driver_col else ""
            if name:
                printers.append({"name": name, "port": port, "driver": driver})
        return printers
    except Exception:
        return []


@router.get("/printers/windows")
async def get_windows_printers(current_user: User = Depends(get_current_user)):
    """Return printers installed on the Windows machine running this server.
    Used by the label-printer dialog to populate a system-printer dropdown."""
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    printers = _list_windows_printers()
    return {"platform": sys.platform, "printers": printers}


@router.get("/printers")
async def get_printers(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    printers = await db.printers.find({}, {"_id": 0}).to_list(1000)
    return printers


@router.post("/printers", response_model=Printer)
async def create_printer(printer_data: PrinterCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    printer = Printer(**printer_data.model_dump())
    doc = printer.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.printers.insert_one(doc)
    return printer


@router.put("/printers/{printer_id}")
async def update_printer(printer_id: str, printer_data: dict, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.printers.update_one({"id": printer_id}, {"$set": printer_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Printer not found")
    updated = await db.printers.find_one({"id": printer_id}, {"_id": 0})
    return updated


@router.delete("/printers/{printer_id}")
async def delete_printer(printer_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await db.printers.delete_one({"id": printer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Printer not found")
    return {"message": "Printer deleted successfully"}


@router.post("/printers/ping")
async def ping_printer(data: dict, current_user: User = Depends(get_current_user)):
    """Test whether a network printer at ip:port is reachable."""
    ip = (data.get("ip_address") or "").strip()
    port = int(data.get("port") or 9100)
    if not ip:
        raise HTTPException(status_code=400, detail="ip_address required")

    def _check():
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(3)
        try:
            result = sock.connect_ex((ip, port))
            return result == 0
        finally:
            sock.close()

    try:
        loop = asyncio.get_event_loop()
        reachable = await loop.run_in_executor(None, _check)
        return {"reachable": reachable, "ip": ip, "port": port}
    except Exception as e:
        return {"reachable": False, "error": str(e)}


@router.post("/printers/{printer_id}/test")
async def test_print(printer_id: str, current_user: User = Depends(get_current_user)):
    """Send a test page to a saved printer."""
    printer = await db.printers.find_one({"id": printer_id}, {"_id": 0})
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    mode = printer.get("mode", "usb")

    if mode == "network":
        ip = (printer.get("ip_address") or "").strip()
        port = int(printer.get("port") or 9100)
        if not ip:
            raise HTTPException(status_code=400, detail="Network printer has no IP address configured")

        now = datetime.datetime.now().strftime("%Y-%m-%d  %H:%M:%S")
        pname = printer.get("name", "Printer")
        sep = b"-" * 32 + b"\n"

        test_data = (
            b"\x1b\x40"                          # ESC @ — initialize / reset
            b"\x1b\x61\x01"                      # ESC a 1 — center align
            b"\x1b\x21\x30"                      # ESC ! — double width + double height
            b"TEST PRINT\n"
            b"\x1b\x21\x00"                      # ESC ! — normal size
            b"\x1b\x45\x01"                      # ESC E — bold on
            b"Printer is working!\n"
            b"\x1b\x45\x00"                      # ESC E — bold off
            + sep +
            b"\x1b\x61\x00"                      # ESC a 0 — left align
            + f"Printer : {pname}\n".encode() +
            f"Address : {ip}:{port}\n".encode() +
            f"Time    : {now}\n".encode() +
            sep +
            b"\x1b\x61\x01"                      # center
            b"** Connection OK **\n"
            b"\n\n\n\n"
            b"\x1d\x56\x42\x00"                  # GS V B 0 — feed and full cut
        )

        def _send():
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(8)
            try:
                s.connect((ip, port))
                s.sendall(test_data)
                s.shutdown(socket.SHUT_WR)
            finally:
                s.close()

        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, _send)
            return {"success": True, "message": "Test page sent to printer"}
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Could not reach printer at {ip}:{port} — {e}")

    elif mode == "usb":
        if sys.platform != "win32":
            raise HTTPException(status_code=400, detail="USB printing only supported on the Windows server")

        win_name = (printer.get("windows_printer_name") or printer.get("name") or "").strip()
        if not win_name:
            raise HTTPException(
                status_code=400,
                detail="No Windows printer name configured. Edit the printer to set the system printer name.",
            )

        def _print_usb():
            r = subprocess.run(
                ["wmic", "printer", "where", f"Name='{win_name}'", "call", "PrintTestPage"],
                capture_output=True, text=True, timeout=15,
            )
            ok = r.returncode == 0 or "ReturnValue = 0" in r.stdout
            return ok, (r.stderr or r.stdout).strip()

        try:
            loop = asyncio.get_event_loop()
            ok, detail = await loop.run_in_executor(None, _print_usb)
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

        if ok:
            return {"success": True, "message": "Test page sent to printer"}
        raise HTTPException(status_code=502, detail=detail or "Printer not found or unavailable")

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Test print is not supported for '{mode}' connection mode from the server.",
        )


@router.get("/printers/assigned")
async def get_assigned_printers(current_user: User = Depends(get_current_user)):
    """Get printers assigned to the user's outlet"""
    outlet_id = current_user.outlet_id
    if not outlet_id:
        printers = await db.printers.find({"active": True}, {"_id": 0}).to_list(100)
    else:
        printers = await db.printers.find({"outlet_id": outlet_id, "active": True}, {"_id": 0}).to_list(100)
    return printers
