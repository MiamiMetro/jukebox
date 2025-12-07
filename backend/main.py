from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import json, time
import os
import asyncio
import uuid
from typing import Dict, Set, Optional
from dataclasses import dataclass, field
from yt_api import router as youtube_router, download_queue, active_downloads_per_ip, ensure_workers_started
from songs_api import router as songs_router

# User role types
UserRole = str  # "host", "moderator", "listener"

@dataclass
class User:
    """Represents a user in a room"""
    websocket: WebSocket
    name: str = "No name"
    role: UserRole = "listener"
    client_ip: str = "unknown"

@dataclass
class Room:
    """Represents a room with its state"""
    slug: str
    queue: list = field(default_factory=list)
    state: dict = field(default_factory=lambda: {
        "track": None,
        "is_playing": False,
        "start_time": None,
        "position": 0.0,
        "duration": None,
    })
    users: Dict[WebSocket, User] = field(default_factory=dict)
    host: Optional[WebSocket] = None
    created_at: float = field(default_factory=time.time)
    
    def get_user(self, ws: WebSocket) -> Optional[User]:
        """Get user by websocket"""
        return self.users.get(ws)
    
    def is_host_or_mod(self, ws: WebSocket) -> bool:
        """Check if user is host or moderator"""
        user = self.get_user(ws)
        return user is not None and user.role in ("host", "moderator")
    
    def add_user(self, ws: WebSocket, name: str = "No name", client_ip: str = "unknown") -> User:
        """Add user to room, assign host if no host exists"""
        # Only add if WebSocket is connected
        if ws.client_state.name != "CONNECTED":
            raise ValueError("Cannot add user: WebSocket is not connected")
        
        user = User(websocket=ws, name=name, client_ip=client_ip)
        
        # If no host or current host is disconnected, make this user the host
        if self.host is None or (self.host.client_state.name != "CONNECTED"):
            user.role = "host"
            self.host = ws
        
        self.users[ws] = user
        return user
    
    async def remove_user(self, ws: WebSocket):
        """Remove user from room, reassign host if needed"""
        if ws not in self.users:
            return  # Already removed, don't broadcast again
        if ws in self.users:
            user = self.users[ws]
            was_host = user.role == "host"
            del self.users[ws]
            
            # If host left, assign new host (first moderator or first user with active connection)
            if was_host and self.host == ws:
                self.host = None
                new_host_ws = None
                # Find first moderator with active connection
                for ws_user, user_obj in self.users.items():
                    if user_obj.role == "moderator" and ws_user.client_state.name == "CONNECTED":
                        user_obj.role = "host"
                        self.host = ws_user
                        new_host_ws = ws_user
                        break
                # If no moderator, assign first user with active connection as host
                if self.host is None and self.users:
                    for ws_user in self.users.keys():
                        if ws_user.client_state.name == "CONNECTED":
                            self.users[ws_user].role = "host"
                            self.host = ws_user
                            new_host_ws = ws_user
                            break
                
                    # Send updated user_info to the new host
                    if new_host_ws:
                        try:
                            new_host_user = self.users[new_host_ws]
                            new_host_port = new_host_ws.client.port if hasattr(new_host_ws, 'client') and new_host_ws.client else None
                            await new_host_ws.send_json({
                                "type": "user_info",
                                "payload": {
                                    "name": new_host_user.name,
                                    "role": "host",
                                    "is_host": True,
                                    "is_moderator": True,
                                    "client_ip": new_host_user.client_ip,
                                    "client_port": new_host_port,
                                },
                                "server_time": time.time()
                            })
                        except Exception:
                            pass  # Connection might be dead, will be cleaned up in broadcast
            
            # Always broadcast updated user list when a user is removed
            await self.broadcast_users()
    
    
    def get_active_users(self):
        """Get list of active users"""
        active_users = []
        for ws_user, user_obj in self.users.items():
            if ws_user.client_state.name == "CONNECTED":
                client_port = ws_user.client.port if hasattr(ws_user, 'client') and ws_user.client else None
                active_users.append({
                    "name": user_obj.name,
                    "role": user_obj.role,
                    "client_ip": user_obj.client_ip,
                    "client_port": client_port,
                    "is_host": user_obj.role == "host",
                    "is_moderator": user_obj.role in ("host", "moderator"),
                })
        return active_users
    
    async def broadcast_users(self):
        """Broadcast current user list to all users in room (sends first page for consistency)"""
        active_users = self.get_active_users()
        total = len(active_users)
        # Send first 10 users (first page)
        page_users = active_users[:10]
        has_more = total > 10
        
        await self.broadcast({
            "type": "users_sync",
            "payload": {
                "users": page_users,
                "page": 0,
                "limit": 10,
                "has_more": has_more,
                "total": total,
            },
            "server_time": time.time()
        })
    
    async def send_users_page(self, ws: WebSocket, page: int = 0, limit: int = 10):
        """Send a paginated page of users to a specific WebSocket"""
        active_users = self.get_active_users()
        total = len(active_users)
        start_idx = page * limit
        end_idx = start_idx + limit
        page_users = active_users[start_idx:end_idx]
        has_more = end_idx < total
        
        await ws.send_json({
            "type": "users_sync",
            "payload": {
                "users": page_users,
                "page": page,
                "limit": limit,
                "has_more": has_more,
                "total": total,
            },
            "server_time": time.time()
        })
    
    def is_empty(self) -> bool:
        """Check if room has no users"""
        return len(self.users) == 0
    
    async def broadcast(self, data: dict, exclude: Optional[WebSocket] = None):
        """Broadcast message to all users in room"""
        dead = []
        for ws in list(self.users.keys()):
            if ws == exclude:
                continue
            # Check if WebSocket is still connected
            if ws.client_state.name != "CONNECTED":
                dead.append(ws)
                continue
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            try:
                await self.remove_user(ws)
            except Exception:
                pass  # Already removed or connection dead

# Store all rooms by slug
rooms: Dict[str, Room] = {}

# Initialize test rooms (for testing)
def initialize_test_rooms():
    """Create 13 test rooms for testing purposes"""
    for i in range(1, 14):
        room_slug = f"room{i}"
        if room_slug not in rooms:
            rooms[room_slug] = Room(slug=room_slug)
            print(f"Created test room: {room_slug}")

# Initialize test rooms on startup
initialize_test_rooms()

# Store client IPs per WebSocket (for tracking active downloads)
client_ips: Dict[WebSocket, str] = {}

async def start_pending_download(room: Room, queue_item_id: str, client_ip: str, video_id: str):
    """Start download for a pending queue item in a room"""
    from yt_api import download_queue, active_downloads_per_ip
    
    try:
        # Mark IP as downloading
        active_downloads_per_ip[client_ip] = queue_item_id
        
        # Ensure workers are started
        ensure_workers_started()
        
        # Add to download queue
        task_id = await download_queue.add_task(video_id, "bestaudio/best")
        
        # Wait for download to complete
        task = download_queue.tasks.get(task_id)
        if task:
            try:
                result = await asyncio.wait_for(task.future, timeout=600.0)
                
                # Update the queue item with download results
                for item in room.queue:
                    if item.get("id") == queue_item_id:
                        item["url"] = result.get("url", "")
                        # Update artwork if available
                        if result.get("artwork"):
                            item["artwork"] = result.get("artwork")
                        duration = result.get("duration")
                        if duration:
                            item["duration"] = max(1, duration - 1.25)  # Duration - 1.25 seconds for buffer
                        item["isPending"] = False  # Mark as completed
                        # Remove video_id as it's no longer needed
                        if "video_id" in item:
                            del item["video_id"]
                        break
                
                # Broadcast updated queue to room
                await room.broadcast({
                    "type": "queue_sync",
                    "payload": {"queue": room.queue},
                    "server_time": time.time()
                })
                
                # If no current track and this item is now ready, set it as current track
                if not room.state.get("track"):
                    await set_first_available_track(room)
            except asyncio.TimeoutError:
                # Download timed out - mark as failed
                for item in room.queue:
                    if item.get("id") == queue_item_id:
                        item["isPending"] = False
                        item["url"] = ""  # Clear URL to indicate failure
                        break
                await room.broadcast({
                    "type": "queue_sync",
                    "payload": {"queue": room.queue},
                    "server_time": time.time()
                })
            except Exception as e:
                # Download failed - mark as failed
                for item in room.queue:
                    if item.get("id") == queue_item_id:
                        item["isPending"] = False
                        item["url"] = ""  # Clear URL to indicate failure
                        break
                await room.broadcast({
                    "type": "queue_sync",
                    "payload": {"queue": room.queue},
                    "server_time": time.time()
                })
    finally:
        # Remove IP from active downloads
        if client_ip in active_downloads_per_ip:
            del active_downloads_per_ip[client_ip]

async def set_first_available_track(room: Room):
    """Helper function to set the first available (non-pending, non-suggested) track in the queue if no current track"""
    now = time.time()
    current_track = room.state.get("track")
    
    # If there's already a current track, don't change it
    if current_track:
        return
    
    # Find first available track (not pending, not suggested, and has URL)
    for item in room.queue:
        if not item.get("isPending", False) and not item.get("isSuggested", False) and item.get("url"):
            room.state["track"] = item
            room.state["duration"] = item.get("duration")
            room.state["position"] = 0.0
            room.state["is_playing"] = False
            room.state["start_time"] = None
            await room.broadcast({
                "type": "set_track",
                "payload": {
                    "track": room.state["track"],
                    "is_playing": False,
                },
                "server_time": now
            })
            break

async def advance_to_next_track(room: Room):
    """Helper function to advance to the next track in the queue for a room"""
    now = time.time()
    next_track = None
    
    try:
        # Try to find current track in queue by ID
        current_track = room.state.get("track")
        
        # If no current track but queue has items, go to first track
        if not current_track:
            if room.queue:
                # Find first available track (not pending, not suggested, and has URL)
                for item in room.queue:
                    if not item.get("isPending", False) and not item.get("isSuggested", False) and item.get("url"):
                        next_track = item
                        break
        else:
            # Find current track index
            current_index = next((i for i, t in enumerate(room.queue) if t.get("id") == current_track.get("id")), -1)
            if current_index >= 0 and len(room.queue) > 0:
                # Find next available track (skip pending and suggested ones, loop around)
                for i in range(len(room.queue)):
                    check_index = (current_index + 1 + i) % len(room.queue)
                    check_track = room.queue[check_index]
                    if not check_track.get("isPending", False) and not check_track.get("isSuggested", False) and check_track.get("url"):
                        next_track = check_track
                        break
            else:
                # Current track not in queue, go to first available track
                for item in room.queue:
                    if not item.get("isPending", False) and not item.get("isSuggested", False) and item.get("url"):
                        next_track = item
                        break
    except (IndexError, ValueError):
        # Fallback to first available track if queue is empty or error
        for item in room.queue:
            if not item.get("isPending", False) and not item.get("isSuggested", False) and item.get("url"):
                next_track = item
                break
    
    if next_track:
        room.state["track"] = next_track
        room.state["duration"] = next_track.get("duration")
        room.state["position"] = 0.0
        room.state["is_playing"] = False
        room.state["start_time"] = None
        await room.broadcast({
            "type": "next-track",
            "payload": {"track": room.state["track"]},
            "server_time": now
        })

async def advance_to_previous_track(room: Room):
    """Helper function to go to the previous track in the queue for a room"""
    now = time.time()
    try:
        # Try to find current track in queue by ID
        current_track = room.state.get("track")
        if not current_track:
            return
        
        current_index = next((i for i, t in enumerate(room.queue) if t.get("id") == current_track.get("id")), -1)
        if current_index >= 0 and len(room.queue) > 0:
            # Go to previous track (wrap around to last track if at first)
            previous_index = (current_index - 1) % len(room.queue)
            previous_track = room.queue[previous_index]
        else:
            # Current track not in queue, go to last track
            previous_track = room.queue[-1] if room.queue else None
    except (IndexError, ValueError):
        # Fallback to last track if queue is empty or error
        previous_track = room.queue[-1] if room.queue else None
    
    if previous_track:
        room.state["track"] = previous_track
        room.state["duration"] = previous_track.get("duration")
        room.state["position"] = 0.0
        room.state["is_playing"] = False
        room.state["start_time"] = None
        await room.broadcast({
            "type": "previous-track",
            "payload": {"track": room.state["track"]},
            "server_time": now
        })

async def check_track_end():
    """Background task that periodically checks if tracks have ended in all rooms"""
    while True:
        await asyncio.sleep(1)  # Check every second
        
        for room in list(rooms.values()):
            state = room.state
            if state.get("is_playing") and state.get("start_time") is not None and state.get("duration") is not None:
                now = time.time()
                current_position = now - state["start_time"]
                
                # Check if track has ended (with small buffer to account for timing)
                if current_position >= state["duration"]:
                    # Track has ended - advance to next track
                    track_title = state.get("track", {}).get("title", "Unknown")
                    print(f"Room {room.slug}: Track ended: {track_title}, advancing to next track")
                    await advance_to_next_track(room)

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

@app.get("/api/rooms")
async def get_rooms(page: int = 0, limit: int = 5, search: str = ""):
    """
    Get list of rooms with pagination and search.
    This is a REST endpoint so users can discover rooms without WebSocket connection.
    """
    # Get all room slugs
    all_rooms = list(rooms.keys())
    
    # Filter by search query if provided
    if search:
        filtered_rooms = [slug for slug in all_rooms if search.lower() in slug.lower()]
    else:
        filtered_rooms = all_rooms
    
    # Sort by creation time (newest first), but exclude current room from duplicates
    sorted_rooms = sorted(
        filtered_rooms,
        key=lambda slug: rooms[slug].created_at,
        reverse=True
    )
    
    # Remove duplicates (in case of any)
    seen = set()
    unique_rooms = []
    for slug in sorted_rooms:
        if slug not in seen:
            seen.add(slug)
            unique_rooms.append(slug)
    sorted_rooms = unique_rooms
    
    # Paginate
    start_idx = page * limit
    end_idx = start_idx + limit
    page_rooms = sorted_rooms[start_idx:end_idx]
    
    # Build room info
    room_list = []
    for slug in page_rooms:
        room_obj = rooms[slug]
        # Count only active WebSocket connections
        # Filter out any dead connections
        active_users = [
            ws for ws in room_obj.users.keys()
            if ws.client_state.name == "CONNECTED"
        ]
        user_count = len(active_users)
        
        # Clean up dead connections
        dead_connections = [
            ws for ws in room_obj.users.keys()
            if ws.client_state.name != "CONNECTED"
        ]
        for dead_ws in dead_connections:
            try:
                await room_obj.remove_user(dead_ws)
            except Exception:
                pass  # Already removed or connection dead
        
        room_list.append({
            "slug": slug,
            "user_count": user_count,
            "queue_length": len(room_obj.queue),
            "created_at": room_obj.created_at,
            "has_host": room_obj.host is not None and room_obj.host.client_state.name == "CONNECTED" if room_obj.host else False,
        })
    
    return {
        "rooms": room_list,
        "page": page,
        "limit": limit,
        "has_more": end_idx < len(sorted_rooms),
        "total": len(sorted_rooms),
    }

@app.get("/api/rooms/{slug}/users")
async def get_room_users(slug: str, page: int = 0, limit: int = 10):
    """
    Get list of users in a specific room with pagination.
    Only returns users with active WebSocket connections.
    """
    if slug not in rooms:
        return {"error": "Room not found", "users": [], "page": page, "limit": limit, "has_more": False, "total": 0}
    
    room = rooms[slug]
    active_users = room.get_active_users()
    
    # Paginate
    total = len(active_users)
    start_idx = page * limit
    end_idx = start_idx + limit
    page_users = active_users[start_idx:end_idx]
    has_more = end_idx < total
    
    return {
        "slug": slug,
        "users": page_users,
        "user_count": total,
        "page": page,
        "limit": limit,
        "has_more": has_more,
        "total": total,
    }

# Mount static files (HTML files in the backend directory)
app.mount("/static", StaticFiles(directory=os.path.dirname(__file__)), name="static")

def get_or_create_room(slug: str) -> Room:
    """Get existing room or create new one"""
    if slug not in rooms:
        rooms[slug] = Room(slug=slug)
        print(f"Created new room: {slug}")
    return rooms[slug]

@app.websocket("/ws/{slug}")
async def ws_endpoint(ws: WebSocket, slug: str):
    await ws.accept()
    
    # Get or create room
    room = get_or_create_room(slug)
    
    # Get and store client IP
    client_ip = ws.client.host if hasattr(ws, 'client') and ws.client else "unknown"
    
    # Only proceed if WebSocket is actually connected
    if ws.client_state.name != "CONNECTED":
        print(f"Warning: WebSocket not connected, rejecting connection to room {slug}")
        await ws.close(code=1006, reason="WebSocket not connected")
        return
    
    # Check if this WebSocket is already in the room (prevent duplicates)
    if ws in room.users:
        print(f"Warning: WebSocket already in room {slug}, removing old entry")
        await room.remove_user(ws)
    
    client_ips[ws] = client_ip
    
    # Add user to room (only if WebSocket is connected)
    try:
        user = room.add_user(ws, name="No name", client_ip=client_ip)
        active_count = len([u for u in room.users.keys() if u.client_state.name == "CONNECTED"])
        print(f"User {user.name} ({user.role}) connected to room {slug} from {client_ip} (total active users: {active_count}/{len(room.users)})")
        
        # Broadcast updated user list to all users in room (including the new user)
        await room.broadcast_users()
    except ValueError as e:
        print(f"Error adding user to room {slug}: {e}")
        await ws.close(code=1006, reason=str(e))
        return

    # Send current state when someone joins
    await ws.send_json({
        "type": "state_sync",
        "payload": room.state,
        "server_time": time.time()
    })
    
    # Send current queue when someone joins
    await ws.send_json({
        "type": "queue_sync",
        "payload": {"queue": room.queue},
        "server_time": time.time()
    })
    
    # Send user info (include IP and port for identification)
    client_port = ws.client.port if hasattr(ws, 'client') and ws.client else None
    await ws.send_json({
        "type": "user_info",
        "payload": {
            "name": user.name,
            "role": user.role,
            "is_host": user.role == "host",
            "is_moderator": user.role in ("host", "moderator"),
            "client_ip": client_ip,
            "client_port": client_port,
        },
        "server_time": time.time()
    })

    try:
        while True:
            data = await ws.receive_json()
            t = data.get("type")
            
            # Get client IP for this connection
            current_client_ip = client_ips.get(ws, "unknown")
            
            # Get user for permission checks
            user = room.get_user(ws)
            if not user:
                # User not in room, skip
                continue

            if t == "play":
                # Check permission - only host/mods can control player
                if not room.is_host_or_mod(ws):
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "Only hosts and moderators can control playback"},
                        "server_time": time.time()
                    })
                    continue
                
                # set authoritative start time
                now = time.time()
                room.state["is_playing"] = True
                room.state["start_time"] = now - room.state["position"]
                await room.broadcast({
                    "type": "play",
                    "payload": {
                        "start_time": room.state["start_time"]
                    },
                    "server_time": now
                })

            elif t == "pause":
                # Check permission
                if not room.is_host_or_mod(ws):
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "Only hosts and moderators can control playback"},
                        "server_time": time.time()
                    })
                    continue
                
                now = time.time()
                if room.state["is_playing"]:
                    room.state["position"] = now - room.state["start_time"]
                    room.state["is_playing"] = False
                await room.broadcast({
                    "type": "pause",
                    "payload": {"position": room.state["position"]},
                    "server_time": now
                })

            elif t == "seek":
                # Check permission
                if not room.is_host_or_mod(ws):
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "Only hosts and moderators can control playback"},
                        "server_time": time.time()
                    })
                    continue
                
                # move to a new playback position
                now = time.time()
                new_pos = data["payload"]["position"]
                room.state["position"] = new_pos
                if room.state["is_playing"]:
                    room.state["start_time"] = now - new_pos
                await room.broadcast({
                    "type": "seek",
                    "payload": {"position": new_pos, "is_playing": room.state["is_playing"]},
                    "server_time": now
                })

            elif t == "set_track":
                # Check permission
                if not room.is_host_or_mod(ws):
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "Only hosts and moderators can change tracks"},
                        "server_time": time.time()
                    })
                    continue
                
                now = time.time()
                track_data = data.get("payload", {}).get("track", {})
                should_play = data.get("payload", {}).get("is_playing", False)
                
                # If track is just a URL string, convert it to full track object
                if isinstance(track_data, str):
                    # Extract filename from URL for title
                    filename = track_data.split("/")[-1].replace(".mp3", "").replace("_", " ")
                    room.state["track"] = {
                        "id": str(time.time()),  # Generate unique ID
                        "title": filename,
                        "artist": "Unknown Artist",
                        "url": track_data,
                        "artwork": "https://picsum.photos/id/842/1500/1500",
                        "source": "youtube" if "youtube.com" in track_data or "youtu.be" in track_data else "html5"
                    }
                    room.state["duration"] = None  # Duration unknown for URL-only tracks
                else:
                    # Full track object provided
                    room.state["track"] = {
                        "id": track_data.get("id", str(time.time())),
                        "title": track_data.get("title", "Unknown"),
                        "artist": track_data.get("artist", "Unknown Artist"),
                        "url": track_data.get("url", ""),
                        "artwork": track_data.get("artwork"),
                        "source": track_data.get("source", "html5"),
                        "duration": track_data.get("duration")
                    }
                    room.state["duration"] = track_data.get("duration")
                
                room.state["position"] = 0.0
                room.state["is_playing"] = should_play
                if should_play:
                    room.state["start_time"] = now  # Set start time for playback
                else:
                    room.state["start_time"] = None
                
                await room.broadcast({
                    "type": "set_track",
                    "payload": {
                        "track": room.state["track"],
                        "is_playing": room.state["is_playing"],
                        "start_time": room.state["start_time"]
                    },
                    "server_time": now
                })

            elif t == "next-track":
                # Check permission
                if not room.is_host_or_mod(ws):
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "Only hosts and moderators can skip tracks"},
                        "server_time": time.time()
                    })
                    continue
                
                # round robin to the next track
                await advance_to_next_track(room)

            elif t == "previous-track":
                # Check permission
                if not room.is_host_or_mod(ws):
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "Only hosts and moderators can skip tracks"},
                        "server_time": time.time()
                    })
                    continue
                
                # round robin to the previous track
                await advance_to_previous_track(room)

            elif t == "shuffle_queue":
                # Check permission
                if not room.is_host_or_mod(ws):
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "Only hosts and moderators can shuffle the queue"},
                        "server_time": time.time()
                    })
                    continue
                
                # Shuffle the queue
                now = time.time()
                import random
                if len(room.queue) > 1:
                    # Shuffle the queue (excluding current track if it exists)
                    current_track = room.state.get("track")
                    current_track_id = current_track.get("id") if current_track else None
                    
                    # Separate current track from the rest
                    if current_track_id:
                        other_tracks = [t for t in room.queue if t.get("id") != current_track_id]
                        if other_tracks:
                            random.shuffle(other_tracks)
                            # Put current track at the beginning, then shuffled rest
                            room.queue = [t for t in room.queue if t.get("id") == current_track_id] + other_tracks
                        # If only one track, no need to shuffle
                    else:
                        # No current track, just shuffle everything
                        random.shuffle(room.queue)
                    
                    # Broadcast updated queue to all clients
                    await room.broadcast({
                        "type": "queue_sync",
                        "payload": {"queue": room.queue},
                        "server_time": now
                    })

            elif t == "repeat_track":
                # Check permission
                if not room.is_host_or_mod(ws):
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "Only hosts and moderators can repeat tracks"},
                        "server_time": time.time()
                    })
                    continue
                
                # Add current track to queue right after current track
                now = time.time()
                current_track = room.state.get("track")
                
                if not current_track:
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "No track currently playing"},
                        "server_time": now
                    })
                    continue
                
                # Find current track position in queue
                current_index = next((i for i, t in enumerate(room.queue) if t.get("id") == current_track.get("id")), -1)
                
                # Create a copy of the current track with a new unique ID
                unique_id = str(uuid.uuid4())
                repeated_track = {
                    "id": unique_id,
                    "title": current_track.get("title", "Unknown"),
                    "artist": current_track.get("artist", "Unknown Artist"),
                    "url": current_track.get("url", ""),
                    "artwork": current_track.get("artwork"),
                    "source": current_track.get("source", "html5"),
                    "duration": current_track.get("duration"),
                    "isSuggested": False,
                    "votes": 0,
                }
                
                # Insert right after current track (or at the end if not found)
                if current_index >= 0:
                    room.queue.insert(current_index + 1, repeated_track)
                else:
                    # Current track not in queue, just append
                    room.queue.append(repeated_track)
                
                # Broadcast updated queue to all clients
                await room.broadcast({
                    "type": "queue_sync",
                    "payload": {"queue": room.queue},
                    "server_time": now
                })

            elif t == "ping":
                await ws.send_json({
                    "type": "pong",
                    "server_time": time.time()
                })

            elif t == "get_users":
                # Send paginated user list
                page = data.get("payload", {}).get("page", 0)
                limit = data.get("payload", {}).get("limit", 10)
                await room.send_users_page(ws, page, limit)
            elif t == "set_moderator":
                # Only hosts can set moderator status (not moderators)
                user = room.get_user(ws)
                if not user or user.role != "host":
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "Only hosts can set moderator status"},
                        "server_time": time.time()
                    })
                    continue
                
                # Find the target user by IP and port
                target_ip = data.get("payload", {}).get("client_ip")
                target_port = data.get("payload", {}).get("client_port")
                is_moderator = data.get("payload", {}).get("is_moderator", False)
                
                if not target_ip:
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "Invalid target user"},
                        "server_time": time.time()
                    })
                    continue
                
                # Find the target user
                target_user = None
                target_ws = None
                for ws_user, user_obj in room.users.items():
                    if (user_obj.client_ip == target_ip and 
                        ws_user.client_state.name == "CONNECTED"):
                        # Match port if provided
                        if target_port is not None:
                            user_port = ws_user.client.port if hasattr(ws_user, 'client') and ws_user.client else None
                            if user_port != target_port:
                                continue
                        target_user = user_obj
                        target_ws = ws_user
                        break
                
                if not target_user or not target_ws:
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "User not found"},
                        "server_time": time.time()
                    })
                    continue
                
                # Don't allow changing host's role
                if target_user.role == "host":
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "Cannot change host's role"},
                        "server_time": time.time()
                    })
                    continue
                
                # Set moderator status
                if is_moderator:
                    target_user.role = "moderator"
                else:
                    target_user.role = "listener"
                
                # Send updated user_info to the target user
                try:
                    target_port_val = target_ws.client.port if hasattr(target_ws, 'client') and target_ws.client else None
                    await target_ws.send_json({
                        "type": "user_info",
                        "payload": {
                            "name": target_user.name,
                            "role": target_user.role,
                            "is_host": False,
                            "is_moderator": target_user.role == "moderator",
                            "client_ip": target_user.client_ip,
                            "client_port": target_port_val,
                        },
                        "server_time": time.time()
                    })
                except Exception:
                    pass  # Connection might be dead
                
                # Broadcast updated user list
                await room.broadcast_users()
            elif t == "get_state":
                # Send current state to requesting client
                now = time.time()
                if room.state.get("is_playing") and room.state.get("start_time") is not None:
                    room.state["position"] = now - room.state["start_time"]
                await ws.send_json({
                    "type": "state_sync",
                    "payload": room.state,
                    "server_time": now
                })

            elif t == "get_queue":
                # Send current queue to requesting client
                now = time.time()
                await ws.send_json({
                    "type": "queue_sync",
                    "payload": {"queue": room.queue},
                    "server_time": now
                })

            elif t == "dance":
                # Broadcast dance command to all users in this room
                now = time.time()
                await room.broadcast({
                    "type": "dance",
                    "payload": {},
                    "server_time": now
                })

            elif t == "delete_item":
                # Check permission
                if not room.is_host_or_mod(ws):
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "Only hosts and moderators can delete items"},
                        "server_time": time.time()
                    })
                    continue
                
                # Delete item from queue
                now = time.time()
                item_id = data.get("payload", {}).get("item_id")
                if item_id:
                    # Check if the deleted item is the current track
                    current_track = room.state.get("track")
                    is_current_track = current_track and current_track.get("id") == item_id
                    
                    # Remove item from queue
                    room.queue[:] = [item for item in room.queue if item.get("id") != item_id]
                    
                    # Broadcast updated queue to all clients
                    await room.broadcast({
                        "type": "queue_sync",
                        "payload": {"queue": room.queue},
                        "server_time": now
                    })
                    
                    # If the deleted item was the current track, handle track change
                    if is_current_track:
                        # Check if there are any available tracks left
                        available_tracks = [item for item in room.queue 
                                          if not item.get("isPending", False) 
                                          and not item.get("isSuggested", False) 
                                          and item.get("url")]
                        
                        if available_tracks:
                            # Advance to next track
                            await advance_to_next_track(room)
                        else:
                            # No tracks left, clear the current track
                            room.state["track"] = None
                            room.state["duration"] = None
                            room.state["position"] = 0.0
                            room.state["is_playing"] = False
                            room.state["start_time"] = None
                            await room.broadcast({
                                "type": "set_track",
                                "payload": {
                                    "track": None,
                                    "is_playing": False,
                                },
                                "server_time": now
                            })

            elif t == "reorder_item":
                # Check permission
                if not room.is_host_or_mod(ws):
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "Only hosts and moderators can reorder items"},
                        "server_time": time.time()
                    })
                    continue
                
                # Reorder item in queue
                now = time.time()
                item_id = data.get("payload", {}).get("item_id")
                direction = data.get("payload", {}).get("direction")  # "up" or "down"
                
                if item_id and direction:
                    # Find current index
                    current_index = next((i for i, item in enumerate(room.queue) if item.get("id") == item_id), -1)
                    
                    if current_index >= 0:
                        if direction == "up" and current_index > 0:
                            # Move up
                            room.queue[current_index], room.queue[current_index - 1] = room.queue[current_index - 1], room.queue[current_index]
                        elif direction == "down" and current_index < len(room.queue) - 1:
                            # Move down
                            room.queue[current_index], room.queue[current_index + 1] = room.queue[current_index + 1], room.queue[current_index]
                        
                        # Broadcast updated queue to all clients
                        await room.broadcast({
                            "type": "queue_sync",
                            "payload": {"queue": room.queue},
                            "server_time": now
                        })

            elif t == "approve_item":
                # Check permission
                if not room.is_host_or_mod(ws):
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "Only hosts and moderators can approve items"},
                        "server_time": time.time()
                    })
                    continue
                
                # Approve suggested item (move from suggested to regular queue)
                now = time.time()
                item_id = data.get("payload", {}).get("item_id")
                
                if item_id:
                    # Find and update the item
                    for item in room.queue:
                        if item.get("id") == item_id:
                            item["isSuggested"] = False
                            break
                    
                    # Broadcast updated queue to all clients
                    await room.broadcast({
                        "type": "queue_sync",
                        "payload": {"queue": room.queue},
                        "server_time": now
                    })

            elif t == "add_to_queue":
                # Check permission
                if not room.is_host_or_mod(ws):
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "Only hosts and moderators can add items to queue"},
                        "server_time": time.time()
                    })
                    continue
                
                # Add item to queue
                now = time.time()
                item_data = data.get("payload", {}).get("item", {})
                
                if item_data:
                    # Create queue item from payload
                    # Generate unique ID for each queue item (even if same song)
                    # Use UUID4 to ensure uniqueness
                    unique_id = str(uuid.uuid4())
                    queue_item = {
                        "id": unique_id,  # Always use unique ID, not the video/song ID
                        "title": item_data.get("title", "Unknown"),
                        "artist": item_data.get("artist", "Unknown Artist"),
                        "url": item_data.get("url", ""),
                        "artwork": item_data.get("artwork"),
                        "source": item_data.get("source", "html5"),
                        "duration": item_data.get("duration"),
                        "isSuggested": item_data.get("isSuggested", False),
                        "votes": item_data.get("votes", 0),
                        "video_id": item_data.get("id"),  # Store original video/song ID separately
                    }
                    
                    # Add to queue
                    room.queue.append(queue_item)
                    
                    # Broadcast updated queue to all clients
                    await room.broadcast({
                        "type": "queue_sync",
                        "payload": {"queue": room.queue},
                        "server_time": now
                    })
                    
                    # If no current track and this item is ready (not pending, has URL), set it as current track
                    if not queue_item.get("isSuggested", False) and not queue_item.get("isPending", False) and queue_item.get("url"):
                        await set_first_available_track(room)

            elif t == "add_pending_download":
                # Check permission
                if not room.is_host_or_mod(ws):
                    await ws.send_json({
                        "type": "error",
                        "payload": {"message": "Only hosts and moderators can add downloads"},
                        "server_time": time.time()
                    })
                    continue
                
                # Add pending download item to queue, then start download
                now = time.time()
                item_data = data.get("payload", {}).get("item", {})
                client_ip = current_client_ip
                
                if item_data:
                    # Check if IP already has an active download
                    if client_ip in active_downloads_per_ip:
                        await ws.send_json({
                            "type": "error",
                            "payload": {"message": "You already have a download in progress. Please wait for it to complete."},
                            "server_time": now
                        })
                        continue
                    
                    # Create pending queue item
                    # Generate unique ID for each queue item (even if same song)
                    unique_id = str(uuid.uuid4())
                    queue_item = {
                        "id": unique_id,  # Always use unique ID, not the video/song ID
                        "title": item_data.get("title", "Unknown"),
                        "artist": item_data.get("artist", "Unknown Artist"),
                        "url": "",  # Will be set when download completes
                        "artwork": item_data.get("artwork"),
                        "source": "html5",
                        "duration": item_data.get("duration"),
                        "isPending": True,  # Mark as pending
                        "video_id": item_data.get("video_id"),  # Store video ID for download
                    }
                    
                    # Add to queue
                    room.queue.append(queue_item)
                    
                    # Broadcast updated queue to all clients
                    await room.broadcast({
                        "type": "queue_sync",
                        "payload": {"queue": room.queue},
                        "server_time": now
                    })
                    
                    # Note: We don't set track here because it's pending - will be set when download completes
                    
                    # Start download in background
                    asyncio.create_task(start_pending_download(room, queue_item["id"], client_ip, item_data.get("video_id")))

            elif t == "check_room_exists":
                # Check if a room exists
                now = time.time()
                room_slug = data.get("payload", {}).get("slug", "").strip()
                exists = room_slug in rooms and room_slug != ""
                
                await ws.send_json({
                    "type": "room_exists",
                    "payload": {
                        "slug": room_slug,
                        "exists": exists,
                    },
                    "server_time": now
                })

    except WebSocketDisconnect:
        # User disconnected - remove from room
        await room.remove_user(ws)
        print(f"User disconnected from room {slug} (remaining users: {len([u for u in room.users.keys() if u.client_state.name == 'CONNECTED'])}/{len(room.users)})")
        
        # remove_user already broadcasts, so we don't need to call it again
        # Clean up client IP mapping
        if ws in client_ips:
            del client_ips[ws]
        
        # Remove room if empty (temporarily disabled for testing)
        # if room.is_empty():
        #     if slug in rooms:
        #         del rooms[slug]
        #         print(f"Room {slug} deleted (no users)")
    except Exception as e:
        # Handle any other errors and ensure user is removed
        print(f"Error in WebSocket connection for room {slug}: {e}")
        await room.remove_user(ws)
        if ws in client_ips:
            del client_ips[ws]
    finally:
        # Ensure user is always removed when connection ends
        if ws in room.users:
            await room.remove_user(ws)
        if ws in client_ips:
            del client_ips[ws]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)