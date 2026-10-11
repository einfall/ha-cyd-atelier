"""Local, read-only Home Assistant state bridge for CYD Atelier ingress."""
import asyncio
import contextlib
import html
import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path

from aiohttp import ClientSession, ClientTimeout, web

ENTITY_ID = re.compile(r"^\w+\.[\w]+$", re.ASCII)
LOG = logging.getLogger("cyd_atelier")


def compact_state(state):
    """Keep display metadata; avoid copying calendars/images/large nested lists."""
    if not isinstance(state, dict) or not ENTITY_ID.fullmatch(state.get("entity_id", "")):
        return None
    attrs = {}
    for key, value in state.get("attributes", {}).items():
        if len(attrs) >= 80:
            break
        if value is None or isinstance(value, (bool, int, float)):
            attrs[key] = value
        elif isinstance(value, str):
            attrs[key] = value[:4096]
    return {"entity_id": state["entity_id"], "state": str(state.get("state", "unknown"))[:4096],
            "attributes": attrs, "source": "ha", "last_updated": state.get("last_updated")}


class StateBridge:
    def __init__(self, token, upstream="ws://supervisor/core/websocket", retry=3):
        self.token = token
        self.upstream = upstream
        self.retry = retry
        self.states = {}
        self.connected = False
        self.message = "Verbindung zu Home Assistant wird hergestellt …"
        self.clients = set()
        self.task = None

    def snapshot(self):
        return {"connected": self.connected, "message": self.message,
                "entities": list(self.states.values())}

    def publish(self, event, payload):
        for queue in tuple(self.clients):
            if queue.full():
                # A slow client must recover the complete current state, never lose deltas.
                while not queue.empty():
                    queue.get_nowait()
                queue.put_nowait(("snapshot", self.snapshot()))
            else:
                queue.put_nowait((event, payload))

    def status(self, connected, message):
        self.connected, self.message = connected, message
        self.publish("status", {"connected": connected, "message": message})

    def apply_change(self, data, publish=True, event_time=None):
        entity_id = data.get("entity_id", "")
        if not ENTITY_ID.fullmatch(entity_id):
            return
        entity = compact_state(data.get("new_state"))
        previous = self.states.get(entity_id)
        updated = (entity or {}).get("last_updated") or event_time
        if previous and updated and previous.get("last_updated"):
            # The initial get_states snapshot may already be newer than buffered events.
            try:
                if datetime.fromisoformat(updated) < datetime.fromisoformat(previous["last_updated"]):
                    return
            except (ValueError, TypeError):
                pass
        if entity:
            self.states[entity_id] = entity
        else:
            self.states.pop(entity_id, None)
        if publish:
            self.publish("state", {"entity_id": entity_id, "entity": entity})

    async def run(self):
        async with ClientSession(timeout=ClientTimeout(total=None, sock_connect=15)) as session:
            while True:
                try:
                    await self.connect(session)
                except asyncio.CancelledError:
                    raise
                except Exception:
                    # Never log upstream frames, URLs, entity attributes, or the token.
                    LOG.warning("Home-Assistant-Verbindung unterbrochen; neuer Versuch folgt.")
                self.status(False, "Home Assistant getrennt · letzte Werte, erneuter Verbindungsversuch …")
                await asyncio.sleep(self.retry)

    async def connect(self, session):
        async with session.ws_connect(self.upstream, heartbeat=20, max_msg_size=32 * 1024 * 1024) as ws:
            msg = await ws.receive_json(timeout=20)
            if msg.get("type") != "auth_required":
                raise RuntimeError("Unexpected handshake")
            await ws.send_json({"type": "auth", "access_token": self.token})
            msg = await ws.receive_json(timeout=20)
            if msg.get("type") != "auth_ok":
                raise RuntimeError("Authentication rejected")
            await ws.send_json({"id": 1, "type": "subscribe_events", "event_type": "state_changed"})
            ready, pending = False, []
            while not ws.closed:
                msg = await ws.receive_json(timeout=None if ready else 30)
                if msg.get("type") == "result" and msg.get("id") == 1:
                    if not msg.get("success"):
                        raise RuntimeError("Subscription rejected")
                    await ws.send_json({"id": 2, "type": "get_states"})
                elif msg.get("type") == "result" and msg.get("id") == 2:
                    if not msg.get("success") or not isinstance(msg.get("result"), list):
                        raise RuntimeError("States rejected")
                    self.states = {e["entity_id"]: e for raw in msg["result"] if (e := compact_state(raw))}
                    # Events received between subscribing and the snapshot are not lost.
                    for data, event_time in pending:
                        self.apply_change(data, publish=False, event_time=event_time)
                    pending.clear()
                    ready = True
                    self.connected, self.message = True, "Home Assistant verbunden · Live-Werte"
                    self.publish("snapshot", self.snapshot())
                elif msg.get("type") == "event" and msg.get("id") == 1:
                    data = msg.get("event", {}).get("data", {})
                    event_time = msg.get("event", {}).get("time_fired")
                    if ready:
                        self.apply_change(data, event_time=event_time)
                    else:
                        pending.append((data, event_time))
                        if len(pending) > 20000:
                            raise RuntimeError("Initial snapshot delayed")


BRIDGE_KEY = web.AppKey("bridge", StateBridge)


async def stream(request):
    bridge = request.app[BRIDGE_KEY]
    queue = asyncio.Queue(maxsize=128)
    bridge.clients.add(queue)
    response = web.StreamResponse(headers={"Content-Type": "text/event-stream",
        "Cache-Control": "no-store", "X-Accel-Buffering": "no"})
    try:
        await response.prepare(request)
        queue.put_nowait(("snapshot", bridge.snapshot()))
        while True:
            try:
                event, payload = await asyncio.wait_for(queue.get(), 12)
                body = "event: " + event + "\ndata: " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n\n"
            except asyncio.TimeoutError:
                body = ": keepalive\n\n"
            await asyncio.wait_for(response.write(body.encode()), 10)
    except (ConnectionError, asyncio.TimeoutError, RuntimeError):
        pass
    finally:
        bridge.clients.discard(queue)
    return response


def ingress_base(raw):
    if not raw or not raw.startswith("/") or raw.startswith("//") or any(c in raw for c in "\\\r\n?#"):
        return "/"
    return raw.rstrip("/") + "/"


def create_app(token, web_dir=None, upstream="ws://supervisor/core/websocket", allowed_peer="172.30.32.2", retry=3):
    directory = Path(web_dir or Path(__file__).parent / "frontend" / "dist").resolve()
    bridge = StateBridge(token, upstream, retry)

    @web.middleware
    async def ingress_only(request, handler):
        # Check the actual network peer, never client-controlled forwarded headers.
        if request.remote != allowed_peer:
            raise web.HTTPForbidden(text="Bitte über Home Assistant öffnen.")
        response = await handler(request)
        if not response.prepared:
            response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    async def index(request):
        base = html.escape(ingress_base(request.headers.get("X-Ingress-Path", "/")), quote=True)
        markup = (directory / "index.html").read_text().replace("<head>", '<head><base href="' + base + '">', 1)
        return web.Response(text=markup, content_type="text/html", headers={"Cache-Control": "no-store"})

    async def status(request):
        return web.json_response({"connected": bridge.connected, "count": len(bridge.states), "message": bridge.message}, headers={"Cache-Control": "no-store"})

    async def static_file(request):
        name = request.match_info["path"]
        path = (directory / name).resolve()
        if not path.is_relative_to(directory) or not path.is_file() or name.startswith("."):
            raise web.HTTPNotFound()
        return web.FileResponse(path, headers={"Cache-Control": "no-cache"})

    async def lifecycle(app):
        bridge.task = asyncio.create_task(bridge.run())
        yield
        bridge.task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await bridge.task

    app = web.Application(middlewares=[ingress_only])
    app[BRIDGE_KEY] = bridge
    app.cleanup_ctx.append(lifecycle)
    app.router.add_get("/", index)
    app.router.add_get("/api/ha/status", status)
    app.router.add_get("/api/ha/events", stream)
    app.router.add_get("/{path:.*}", static_file)
    return app


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    token = os.environ.get("SUPERVISOR_TOKEN")
    if not token:
        raise SystemExit("SUPERVISOR_TOKEN fehlt. Dieses Add-on über Home Assistant starten.")
    web.run_app(create_app(token), host="0.0.0.0", port=8099, access_log=None)
