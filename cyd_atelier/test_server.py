import asyncio
import unittest
from pathlib import Path

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from server import BRIDGE_KEY, StateBridge, compact_state, create_app, ingress_base


def state(entity_id="sensor.kaffee_status", value="Bereit", timestamp="2026-10-11T08:00:00+00:00"):
    return {"entity_id": entity_id, "state": value, "last_updated": timestamp,
            "attributes": {"friendly_name": "Kaffeemaschine", "icon": "mdi:coffee", "unit_of_measurement": "s"}}


class BridgeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.upstream_socket = None
        self.commands = []
        self.connections = 0
        async def websocket(request):
            ws = web.WebSocketResponse()
            await ws.prepare(request)
            self.upstream_socket = ws
            self.connections += 1
            await ws.send_json({"type": "auth_required"})
            auth = await ws.receive_json()
            self.assertEqual(auth, {"type": "auth", "access_token": "test-private-token"})
            await ws.send_json({"type": "auth_ok"})
            subscribe = await ws.receive_json()
            self.commands.append(subscribe)
            await ws.send_json({"type": "result", "id": 1, "success": True})
            fetch = await ws.receive_json()
            self.commands.append(fetch)
            # Older queued event must not overwrite the newer snapshot.
            await ws.send_json({"type": "event", "id": 1, "event": {"data": {
                "entity_id": "sensor.kaffee_status", "new_state": state(value="Alt")}}})
            await ws.send_json({"type": "result", "id": 2, "success": True,
                "result": [state(timestamp="2026-10-11T08:00:01+00:00")]})
            async for msg in ws:
                pass
            return ws
        upstream = web.Application()
        upstream.router.add_get("/core/websocket", websocket)
        self.ha = TestServer(upstream)
        await self.ha.start_server()
        url = str(self.ha.make_url("/core/websocket")).replace("http:", "ws:")
        self.app = create_app("test-private-token", upstream=url, allowed_peer="127.0.0.1", retry=0.03)
        self.client = TestClient(TestServer(self.app))
        await self.client.start_server()
        await self.wait_for(lambda: self.app[BRIDGE_KEY].connected)

    async def asyncTearDown(self):
        await self.client.close()
        await self.ha.close()

    async def wait_for(self, condition):
        async with asyncio.timeout(3):
            while not condition():
                await asyncio.sleep(0.01)

    async def read_event(self, response):
        event, data = None, None
        async with asyncio.timeout(3):
            while True:
                line = (await response.content.readline()).decode().strip()
                if line.startswith("event:"):
                    event = line[7:]
                elif line.startswith("data:"):
                    import json
                    data = json.loads(line[6:])
                elif not line and event:
                    return event, data

    async def test_states_live_create_remove_reconnect(self):
        response = await self.client.get("/api/ha/events")
        event, payload = await self.read_event(response)
        self.assertEqual(event, "snapshot")
        self.assertTrue(payload["connected"])
        self.assertEqual(payload["entities"][0]["state"], "Bereit")
        self.assertNotIn("test-private-token", str(payload))
        self.assertEqual(self.commands[:2], [{"id": 1, "type": "subscribe_events", "event_type": "state_changed"}, {"id": 2, "type": "get_states"}])
        for entity in [state(value="Espresso", timestamp="2026-10-11T08:00:02+00:00"), state("sensor.neu", "42")]:
            await self.upstream_socket.send_json({"type": "event", "id": 1, "event": {"data": {"entity_id": entity["entity_id"], "new_state": entity}}})
            event, payload = await self.read_event(response)
            self.assertEqual(event, "state")
            self.assertEqual(payload["entity"]["state"], entity["state"])
        await self.upstream_socket.send_json({"type": "event", "id": 1, "event": {"data": {"entity_id": "sensor.neu", "new_state": None}}})
        _, payload = await self.read_event(response)
        self.assertIsNone(payload["entity"])
        await self.upstream_socket.close()
        event, payload = await self.read_event(response)
        self.assertEqual(event, "status")
        self.assertFalse(payload["connected"])
        event, payload = await self.read_event(response)
        self.assertEqual(event, "snapshot")
        self.assertTrue(payload["connected"])
        self.assertGreaterEqual(self.connections, 2)
        response.close()

    async def test_ingress_assets_and_private_files(self):
        response = await self.client.get("/", headers={"X-Ingress-Path": "/api/hassio_ingress/test-session"})
        markup = await response.text()
        self.assertIn('<base href="/api/hassio_ingress/test-session/">', markup)
        self.assertIn('src="app.js"', markup)
        for path in ["/app.js", "/style.css", "/assets/icons.json", "/assets/mdi.woff2"]:
            response = await self.client.get(path)
            self.assertEqual(response.status, 200, path)
        response = await self.client.get("/server.py")
        self.assertEqual(response.status, 404)
        response = await self.client.get("/api/ha/status")
        self.assertEqual((await response.json())["count"], 1)

    async def test_ingress_rejects_spoofed_forwarded_header(self):
        denied = TestClient(TestServer(create_app("test", upstream="ws://127.0.0.1:1")))
        await denied.start_server()
        try:
            response = await denied.get("/api/ha/status", headers={"X-Forwarded-For": "172.30.32.2"})
            self.assertEqual(response.status, 403)
        finally:
            await denied.close()

    async def test_slow_client_gets_current_snapshot(self):
        bridge = self.app[BRIDGE_KEY]
        queue = asyncio.Queue(maxsize=1)
        bridge.clients.add(queue)
        bridge.publish("status", {})
        bridge.apply_change({"entity_id": "sensor.neu", "new_state": state("sensor.neu", "42")})
        event, payload = queue.get_nowait()
        self.assertEqual(event, "snapshot")
        self.assertTrue(any(e["entity_id"] == "sensor.neu" for e in payload["entities"]))
        bridge.clients.remove(queue)


class ValueTests(unittest.TestCase):
    def test_safe_attributes_and_paths(self):
        raw = state()
        raw["attributes"]["nested"] = {"items": list(range(1000))}
        raw["attributes"]["long"] = "x" * 9000
        compact = compact_state(raw)
        self.assertNotIn("nested", compact["attributes"])
        self.assertEqual(len(compact["attributes"]["long"]), 4096)
        self.assertEqual(ingress_base("//attacker.invalid/"), "/")
        self.assertEqual(ingress_base("/api/ingress/test"), "/api/ingress/test/")

    def test_old_removal_does_not_remove_recreated_entity(self):
        bridge = StateBridge("test")
        bridge.states["sensor.kaffee_status"] = compact_state(state(timestamp="2026-10-11T08:00:02+00:00"))
        bridge.apply_change({"entity_id": "sensor.kaffee_status", "new_state": None}, event_time="2026-10-11T08:00:01+00:00")
        self.assertIn("sensor.kaffee_status", bridge.states)


if __name__ == "__main__":
    unittest.main()
