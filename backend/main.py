from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import json, time
import os
import asyncio
from yt_api import router as youtube_router
from songs_api import router as songs_router

clients = set()

queue = [
    {
        "id": "1",
        "title": "What Did I Miss",
        "artist": "Drake",
        "url": "https://juke.bgocumlu.workers.dev/jukebox-tracks/DRAKE_-_WHAT_DID_I_MISS_816d7cbb.mp3",
        "artwork": "https://img.youtube.com/vi/weU76DGHKU0/maxresdefault.jpg",
        "source": "html5",
        "duration": 242.0
    },
    {
        "id": "2",
        "title": "Nokia",
        "artist": "Drake",
        "url": "https://juke.bgocumlu.workers.dev/jukebox-tracks/Drake_-_NOKIA_Official_Music_Video_6208fcb9.mp3",
        "artwork": "https://i.ytimg.com/vi/8ekJMC8OtGU/maxresdefault.jpg",
        "source": "html5",
        "duration": 264.0
    },
    {
        "id": "3",
        "title": "Timeless",
        "artist": "The Weeknd",
        "url": "https://juke.bgocumlu.workers.dev/jukebox-tracks/yt-5EpyN_6dqyk.mp3",
        "artwork": "https://i.ytimg.com/vi/5EpyN_6dqyk/maxresdefault.jpg",
        "source": "html5",
        "duration": 255.0 
    },
]

# global playback state
state = {
    "track": queue[0],
    "is_playing": False,
    "start_time": None,  # when the track started (server time)
    "position": 0.0,     # where we paused
    "duration": queue[0].get("duration") if queue[0].get("duration") else None,  # track duration in seconds
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

async def advance_to_next_track():
    """Helper function to advance to the next track in the queue"""
    now = time.time()
    try:
        # Try to find current track in queue by ID
        current_index = next((i for i, t in enumerate(queue) if t.get("id") == state["track"].get("id")), -1)
        if current_index >= 0:
            next_index = (current_index + 1) % len(queue)
            next_track = queue[next_index]
        else:
            # Current track not in queue, go to first track
            next_track = queue[0]
    except (IndexError, ValueError):
        # Fallback to first track if queue is empty or error
        next_track = queue[0] if queue else state["track"]
    
    state["track"] = next_track
    state["duration"] = next_track.get("duration")
    state["position"] = 0.0
    state["is_playing"] = False
    state["start_time"] = None
    await broadcast({
        "type": "next-track",
        "payload": {"track": state["track"]},
        "server_time": now
    })

async def check_track_end():
    """Background task that periodically checks if the current track has ended"""
    while True:
        await asyncio.sleep(1)  # Check every second
        
        if state["is_playing"] and state["start_time"] is not None and state["duration"] is not None:
            now = time.time()
            current_position = now - state["start_time"]
            
            # Check if track has ended (with small buffer to account for timing)
            if current_position >= state["duration"]:
                # Track has ended - advance to next track
                print(f"Track ended: {state['track'].get('title', 'Unknown')}, advancing to next track")
                await advance_to_next_track()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown"""
    # Startup
    asyncio.create_task(check_track_end())
    print("Track end monitoring started")
    yield
    # Shutdown (if needed in the future)
    pass

app = FastAPI(lifespan=lifespan)

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
    
    # send current queue when someone joins
    await ws.send_json({
        "type": "queue_sync",
        "payload": {"queue": queue},
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
                    state["duration"] = None  # Duration unknown for URL-only tracks
                else:
                    # Full track object provided
                    state["track"] = {
                        "id": track_data.get("id", str(time.time())),
                        "title": track_data.get("title", "Unknown"),
                        "artist": track_data.get("artist", "Unknown Artist"),
                        "url": track_data.get("url", ""),
                        "artwork": track_data.get("artwork"),
                        "source": track_data.get("source", "html5"),
                        "duration": track_data.get("duration")
                    }
                    state["duration"] = track_data.get("duration")
                
                state["position"] = 0.0
                state["is_playing"] = True  # Auto-play when track is set
                state["start_time"] = now  # Set start time for playback
                await broadcast({
                    "type": "set_track",
                    "payload": {
                        "track": state["track"],
                        "is_playing": True,
                        "start_time": state["start_time"]
                    },
                    "server_time": now
                })

            elif t == "next-track":
                # round robin to the next track
                await advance_to_next_track()

            elif t == "ping":
                await ws.send_json({
                    "type": "pong",
                    "server_time": time.time()
                })

            elif t == "get_state":
                # Send current state to requesting client
                now = time.time()
                if state["is_playing"] and state["start_time"] is not None:
                    state["position"] = now - state["start_time"]
                await ws.send_json({
                    "type": "state_sync",
                    "payload": state,
                    "server_time": now
                })

            elif t == "get_queue":
                # Send current queue to requesting client
                now = time.time()
                await ws.send_json({
                    "type": "queue_sync",
                    "payload": {"queue": queue},
                    "server_time": now
                })

            elif t == "delete_item":
                # Delete item from queue
                now = time.time()
                item_id = data.get("payload", {}).get("item_id")
                if item_id:
                    # Remove item from queue
                    queue[:] = [item for item in queue if item.get("id") != item_id]
                    # Broadcast updated queue to all clients
                    await broadcast({
                        "type": "queue_sync",
                        "payload": {"queue": queue},
                        "server_time": now
                    })

            elif t == "reorder_item":
                # Reorder item in queue
                now = time.time()
                item_id = data.get("payload", {}).get("item_id")
                direction = data.get("payload", {}).get("direction")  # "up" or "down"
                
                if item_id and direction:
                    # Find current index
                    current_index = next((i for i, item in enumerate(queue) if item.get("id") == item_id), -1)
                    
                    if current_index >= 0:
                        if direction == "up" and current_index > 0:
                            # Move up
                            queue[current_index], queue[current_index - 1] = queue[current_index - 1], queue[current_index]
                        elif direction == "down" and current_index < len(queue) - 1:
                            # Move down
                            queue[current_index], queue[current_index + 1] = queue[current_index + 1], queue[current_index]
                        
                        # Broadcast updated queue to all clients
                        await broadcast({
                            "type": "queue_sync",
                            "payload": {"queue": queue},
                            "server_time": now
                        })

            elif t == "approve_item":
                # Approve suggested item (move from suggested to regular queue)
                # For now, we'll just mark it as not suggested
                # In a full implementation, you might have a separate suggested queue
                now = time.time()
                item_id = data.get("payload", {}).get("item_id")
                
                if item_id:
                    # Find and update the item
                    for item in queue:
                        if item.get("id") == item_id:
                            item["isSuggested"] = False
                            break
                    
                    # Broadcast updated queue to all clients
                    await broadcast({
                        "type": "queue_sync",
                        "payload": {"queue": queue},
                        "server_time": now
                    })

            elif t == "add_to_queue":
                # Add item to queue
                now = time.time()
                item_data = data.get("payload", {}).get("item", {})
                
                if item_data:
                    # Create queue item from payload
                    queue_item = {
                        "id": item_data.get("id", str(time.time())),
                        "title": item_data.get("title", "Unknown"),
                        "artist": item_data.get("artist", "Unknown Artist"),
                        "url": item_data.get("url", ""),
                        "artwork": item_data.get("artwork"),
                        "source": item_data.get("source", "html5"),
                        "duration": item_data.get("duration"),
                        "isSuggested": item_data.get("isSuggested", False),
                        "votes": item_data.get("votes", 0),
                    }
                    
                    # Add to queue
                    queue.append(queue_item)
                    
                    # Broadcast updated queue to all clients
                    await broadcast({
                        "type": "queue_sync",
                        "payload": {"queue": queue},
                        "server_time": now
                    })

    except WebSocketDisconnect:
        clients.remove(ws)
        print("Client disconnected")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)