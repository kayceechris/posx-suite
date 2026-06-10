import asyncio
import datetime
import socket
import subprocess
import sys

from fastapi import APIRouter, HTTPException, Depends

from database import db
from models import User, Printer, PrinterCreate
from auth import get_current_user, has_perm

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
    if not has_perm(current_user, "manage_settings", "manage_printers"):
        raise HTTPException(status_code=403, detail="Not authorized")
    printers = _list_windows_printers()
    return {"platform": sys.platform, "printers": printers}


@router.get("/printers")
async def get_printers(current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "manage_settings", "manage_printers"):
        raise HTTPException(status_code=403, detail="Not authorized")
    printers = await db.printers.find({}, {"_id": 0}).to_list(1000)
    return printers


@router.post("/printers", response_model=Printer)
async def create_printer(printer_data: PrinterCreate, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "manage_settings", "manage_printers"):
        raise HTTPException(status_code=403, detail="Not authorized")

    printer = Printer(**printer_data.model_dump())
    doc = printer.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.printers.insert_one(doc)
    return printer


@router.put("/printers/{printer_id}")
async def update_printer(printer_id: str, printer_data: dict, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "manage_settings", "manage_printers"):
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.printers.update_one({"id": printer_id}, {"$set": printer_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Printer not found")
    updated = await db.printers.find_one({"id": printer_id}, {"_id": 0})
    return updated


@router.delete("/printers/{printer_id}")
async def delete_printer(printer_id: str, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "manage_settings", "manage_printers"):
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await db.printers.delete_one({"id": printer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Printer not found")
    return {"message": "Printer deleted successfully"}


@router.post("/printers/ping")
async def ping_printer(data: dict, current_user: User = Depends(get_current_user)):
    """Test whether a network printer is reachable — routed through the local bridge relay."""
    import json, uuid
    from routes.print_relay import _bridges, _jobs

    ip = (data.get("ip_address") or "").strip()
    port = int(data.get("port") or 9100)
    if not ip:
        raise HTTPException(status_code=400, detail="ip_address required")

    outlet_id = getattr(current_user, "outlet_id", None) or "default"
    ws = _bridges.get(outlet_id) or _bridges.get("default") or next(iter(_bridges.values()), None)

    if ws is None:
        return {"reachable": False, "error": "Print bridge not connected — make sure bridge.py is running on the PC"}

    job_id = str(uuid.uuid4())
    loop = asyncio.get_event_loop()
    future = loop.create_future()
    _jobs[job_id] = future
    try:
        await ws.send_text(json.dumps({"type": "ping", "ip": ip, "port": port, "job_id": job_id}))
        result = await asyncio.wait_for(asyncio.shield(future), timeout=8.0)
        return {"reachable": result.get("ok", False), "ip": ip, "port": port, "error": result.get("error")}
    except asyncio.TimeoutError:
        return {"reachable": False, "error": "Bridge timed out testing printer"}
    finally:
        _jobs.pop(job_id, None)


@router.post("/printers/{printer_id}/test")
async def test_print(printer_id: str, current_user: User = Depends(get_current_user)):
    """Send a test page via the relay bridge."""
    import json, uuid
    from routes.print_relay import _bridges, _jobs

    printer = await db.printers.find_one({"id": printer_id}, {"_id": 0})
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    outlet_id = getattr(current_user, "outlet_id", None) or "default"
    ws = _bridges.get(outlet_id) or _bridges.get("default") or next(iter(_bridges.values()), None)
    if ws is None:
        raise HTTPException(503, "Print bridge not connected — make sure bridge.py is running on the PC")

    mode = printer.get("mode", "network")
    pname = printer.get("name", "Printer")
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def _enc(s): return list(s.encode())

    job_id = str(uuid.uuid4())
    loop = asyncio.get_event_loop()
    future = loop.create_future()
    _jobs[job_id] = future

    try:
        if mode == "network":
            ip = (printer.get("ip_address") or "").strip()
            port = int(printer.get("port") or 9100)
            if not ip:
                raise HTTPException(400, "Network printer has no IP address configured")
            test_bytes = list(
                b"\x1b\x40" + b"\x1b\x61\x01" + b"\x1b\x21\x30"
                + b"TEST PRINT\n" + b"\x1b\x21\x00" + b"\x1b\x45\x01"
                + b"Printer is working!\n" + b"\x1b\x45\x00"
                + b"-" * 32 + b"\n" + b"\x1b\x61\x00"
                + f"Printer : {pname}\n".encode()
                + f"Address : {ip}:{port}\n".encode()
                + f"Time    : {now}\n".encode()
                + b"-" * 32 + b"\n" + b"\x1b\x61\x01"
                + b"** Connection OK **\n" + b"\n\n\n\n" + b"\x1d\x56\x42\x00"
            )
            await ws.send_text(json.dumps({"type": "network", "ip": ip, "port": port, "data": test_bytes, "job_id": job_id}))

        elif mode == "usb":
            win_name = (printer.get("windows_printer_name") or printer.get("name") or "").strip()
            if not win_name:
                raise HTTPException(400, "No Windows printer name configured — edit the printer to set the system printer name")
            test_bytes = [
                0x1b, 0x40, 0x1b, 0x61, 0x01, 0x1b, 0x21, 0x30,
                *_enc("TEST PRINT\n"),
                0x1b, 0x21, 0x00, 0x1b, 0x61, 0x00,
                *_enc(f"Printer : {win_name}\n"),
                *_enc(f"Time    : {now}\n"),
                0x1b, 0x61, 0x01,
                *_enc("** ESC/POS OK **\n"),
                0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x41, 0x03,
            ]
            await ws.send_text(json.dumps({"type": "usb", "printer_name": win_name, "data": test_bytes, "job_id": job_id}))

        else:
            raise HTTPException(400, f"Unsupported printer mode: {mode}")

        result = await asyncio.wait_for(asyncio.shield(future), timeout=15.0)
        if not result.get("ok"):
            raise HTTPException(502, result.get("error", "Print failed"))
        return {"success": True, "message": "Test page sent to printer"}

    except asyncio.TimeoutError:
        raise HTTPException(504, "Bridge timed out — check printer connection")
    finally:
        _jobs.pop(job_id, None)


@router.get("/printers/assigned")
async def get_assigned_printers(current_user: User = Depends(get_current_user)):
    """Get printers assigned to the user's outlet"""
    outlet_id = current_user.outlet_id
    if not outlet_id:
        printers = await db.printers.find({"active": True}, {"_id": 0}).to_list(100)
    else:
        printers = await db.printers.find({"outlet_id": outlet_id, "active": True}, {"_id": 0}).to_list(100)
    return printers
