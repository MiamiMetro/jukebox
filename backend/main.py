from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
import json, time
import os

app = FastAPI()

# Mount static files (HTML files in the backend directory)
app.mount("/static", StaticFiles(directory=os.path.dirname(__file__)), name="static")

clients = set()

# global playback state
state = {
    "track": "https://yhoyscexuxnouexhcndo.supabase.co/storage/v1/object/public/jukebox-tracks/zx6NkXvzrNc.webm",
    "is_playing": False,
    "start_time": None,  # when the track started (server time)
    "position": 0.0,     # where we paused
}

async def broadcast(data: dict):
    msg = json.dumps(data)
    for c in list(clients):
        await c.send_text(msg)

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    print("Client connected")

    # send current state when someone joins
    await ws.send_text(json.dumps({
        "type": "state_sync",
        "payload": state,
        "server_time": time.time()
    }))

    try:
        while True:
            msg = await ws.receive_text()
            data = json.loads(msg)
            t = data.get("type")

            if t == "play":
                # set authoritative start time
                state["is_playing"] = True
                state["start_time"] = time.time() - state["position"]
                await broadcast({
                    "type": "play",
                    "payload": {
                        "start_time": state["start_time"]
                    },
                    "server_time": time.time()
                })

            elif t == "pause":
                if state["is_playing"]:
                    state["position"] = time.time() - state["start_time"]
                    state["is_playing"] = False
                await broadcast({
                    "type": "pause",
                    "payload": {"position": state["position"]},
                    "server_time": time.time()
                })

            elif t == "seek":
                # move to a new playback position
                new_pos = data["payload"]["position"]
                state["position"] = new_pos
                if state["is_playing"]:
                    state["start_time"] = time.time() - new_pos
                await broadcast({
                    "type": "seek",
                    "payload": {"position": new_pos},
                    "server_time": time.time()
                })

            elif t == "set_track":
                state["track"] = data["payload"]["track"]
                state["position"] = 0.0
                state["is_playing"] = False
                await broadcast({
                    "type": "set_track",
                    "payload": {"track": state["track"]},
                    "server_time": time.time()
                })

            elif t == "ping":
                await ws.send_text(json.dumps({
                    "type": "pong",
                    "server_time": time.time()
                }))

            elif t == "get_state":
                # Send current state to requesting client
                await ws.send_text(json.dumps({
                    "type": "state_sync",
                    "payload": state,
                    "server_time": time.time()
                }))

    except WebSocketDisconnect:
        clients.remove(ws)
        print("Client disconnected")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)