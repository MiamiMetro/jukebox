from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import json, time
import os
from yt_api import router as youtube_router
from songs_api import router as songs_router

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(youtube_router)
app.include_router(songs_router)

# Mount static files (HTML files in the backend directory)
app.mount("/static", StaticFiles(directory=os.path.dirname(__file__)), name="static")

clients = set()

queue = [
    {
        "id": "1",
        "title": "What Did I Miss",
        "artist": "Drake",
        "url": "https://juke.bgocumlu.workers.dev/jukebox-tracks/DRAKE_-_WHAT_DID_I_MISS_816d7cbb.mp3",
        "artwork": "https://img.youtube.com/vi/weU76DGHKU0/maxresdefault.jpg",
        "source": "html5"
    },
    {
        "id": "2",
        "title": "Nokia",
        "artist": "Drake",
        "url": "https://juke.bgocumlu.workers.dev/jukebox-tracks/Drake_-_NOKIA_Official_Music_Video_6208fcb9.mp3",
        "artwork": "https://i.ytimg.com/vi/8ekJMC8OtGU/maxresdefault.jpg",
        "source": "html5"
    }
]

# global playback state
state = {
    "track": queue[0],
    "is_playing": False,
    "start_time": None,  # when the track started (server time)
    "position": 0.0,     # where we paused
}

async def broadcast(data: dict):
    dead = []
    for c in list(clients):
        try:
            await c.send_json(data)
        except Exception:
            dead.append(c)
    for c in dead:
        try:
            await c.close()
        except Exception:
            pass
        clients.discard(c)

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    print("Client connected")

    # send current state when someone joins
    await ws.send_json({
        "type": "state_sync",
        "payload": state,
        "server_time": time.time()
    })

    try:
        while True:
            data = await ws.receive_json()
            t = data.get("type")

            if t == "play":
                # set authoritative start time
                now = time.time()
                state["is_playing"] = True
                state["start_time"] = now - state["position"]
                await broadcast({
                    "type": "play",
                    "payload": {
                        "start_time": state["start_time"]
                    },
                    "server_time": now
                })

            elif t == "pause":
                now = time.time()
                if state["is_playing"]:
                    state["position"] = now - state["start_time"]
                    state["is_playing"] = False
                await broadcast({
                    "type": "pause",
                    "payload": {"position": state["position"]},
                    "server_time": now
                })

            elif t == "seek":
                # move to a new playback position
                now = time.time()
                new_pos = data["payload"]["position"]
                state["position"] = new_pos
                if state["is_playing"]:
                    state["start_time"] = now - new_pos
                await broadcast({
                    "type": "seek",
                    "payload": {"position": new_pos, "is_playing": state["is_playing"]},
                    "server_time": now
                })

            elif t == "set_track":
                now = time.time()
                track_data = data.get("payload", {}).get("track", {})
                
                # If track is just a URL string, convert it to full track object
                if isinstance(track_data, str):
                    # Extract filename from URL for title
                    filename = track_data.split("/")[-1].replace(".mp3", "").replace("_", " ")
                    state["track"] = {
                        "id": str(time.time()),  # Generate unique ID
                        "title": filename,
                        "artist": "Unknown Artist",
                        "url": track_data,
                        "artwork": "https://picsum.photos/id/842/1500/1500",
                        "source": "youtube" if "youtube.com" in track_data or "youtu.be" in track_data else "html5"
                    }
                else:
                    # Full track object provided
                    state["track"] = {
                        "id": track_data.get("id", str(time.time())),
                        "title": track_data.get("title", "Unknown"),
                        "artist": track_data.get("artist", "Unknown Artist"),
                        "url": track_data.get("url", ""),
                        "artwork": track_data.get("artwork"),
                        "source": track_data.get("source", "html5")
                    }
                
                state["position"] = 0.0
                state["is_playing"] = False
                await broadcast({
                    "type": "set_track",
                    "payload": {"track": state["track"]},
                    "server_time": now
                })

            elif t == "next-track":
                # round robin to the next track
                now = time.time()
                state["track"] = queue[(queue.index(state["track"]) + 1) % len(queue)]
                state["position"] = 0.0
                state["is_playing"] = False
                state["start_time"] = None
                await broadcast({
                    "type": "next-track",
                    "payload": {"track": state["track"]},
                    "server_time": now
                })

            elif t == "ping":
                await ws.send_json({
                    "type": "pong",
                    "server_time": time.time()
                })

            elif t == "get_state":
                # Send current state to requesting client
                state["position"] = time.time() - state["start_time"]
                await ws.send_json({
                    "type": "state_sync",
                    "payload": state,
                    "server_time": time.time()
                })

    except WebSocketDisconnect:
        clients.remove(ws)
        print("Client disconnected")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)