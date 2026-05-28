from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends
from auth import get_current_user
from models import User
import asyncio
import json
import uuid

router = APIRouter(prefix="/api")

# outlet_id → active WebSocket from bridge
_bridges: dict[str, WebSocket] = {}
# job_id → Future waiting for bridge response
_jobs: dict[str, asyncio.Future] = {}

BRIDGE_TOKEN = "posx-bridge-2025"


@router.websocket("/ws/bridge")
async def bridge_ws(websocket: WebSocket, outlet_id: str = "default", token: str = ""):
    if token != BRIDGE_TOKEN:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    _bridges[outlet_id] = websocket
    print(f"[Relay] Bridge connected: outlet_id={outlet_id}")

    try:
        while True:
            text = await websocket.receive_text()
            try:
                msg = json.loads(text)
                job_id = msg.get("job_id")
                if job_id and job_id in _jobs:
                    fut = _jobs[job_id]
                    if not fut.done():
                        fut.set_result(msg)
            except Exception as e:
                print(f"[Relay] Message error: {e}")
    except WebSocketDisconnect:
        if _bridges.get(outlet_id) is websocket:
            _bridges.pop(outlet_id, None)
        print(f"[Relay] Bridge disconnected: outlet_id={outlet_id}")


@router.get("/print-relay/status")
async def relay_status(current_user: User = Depends(get_current_user)):
    connected = bool(_bridges)
    return {"connected": connected, "outlets": list(_bridges.keys())}


@router.post("/print-relay")
async def print_relay(body: dict, current_user: User = Depends(get_current_user)):
    outlet_id = body.get("outlet_id") or getattr(current_user, "outlet_id", None) or "default"

    ws = (
        _bridges.get(outlet_id)
        or _bridges.get("default")
        or next(iter(_bridges.values()), None)
    )
    if ws is None:
        raise HTTPException(
            503,
            "Print bridge not connected — make sure bridge.py is running on the PC and relay.conf is configured"
        )

    job_id = str(uuid.uuid4())
    loop = asyncio.get_event_loop()
    future = loop.create_future()
    _jobs[job_id] = future

    try:
        await ws.send_text(json.dumps({**body, "job_id": job_id}))
        result = await asyncio.wait_for(asyncio.shield(future), timeout=15.0)
        if not result.get("ok"):
            raise HTTPException(502, result.get("error", "Print failed"))
        return result
    except asyncio.TimeoutError:
        raise HTTPException(504, "Print bridge timed out — check printer connection")
    except WebSocketDisconnect:
        _bridges.pop(outlet_id, None)
        raise HTTPException(503, "Bridge disconnected during print")
    finally:
        _jobs.pop(job_id, None)
