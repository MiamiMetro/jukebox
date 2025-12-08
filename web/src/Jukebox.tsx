import { AudioPlayer, type PlayerControls } from "./components/audio-player";
import type { Track } from "./types/audio-player";
import { Button } from "./components/ui/button";
import { useEffect, useRef, useState } from "react";
import { StatefulDrawer } from "./components/ui/stateful-drawer";
import { QueueSearch } from "./components/queue-search";
import { RoomSelector } from "./components/room-selector";
import { ListMusic, Users, X } from "lucide-react";
import { useJukeboxStore } from "./store/jukebox-store";
import { cn } from "./lib/utils";

function AudioPlayerContainer({ currentRoom, onRoomChange }: { currentRoom: string; onRoomChange: (room: string) => void }) {
    // Use Zustand store for shared state
    const { 
        setWs: setStoreWs,
        setControls: setStoreControls,
        mode,
        setMode: setStoreMode,
        setCurrentTrack: setStoreTrack,
        setQueue: setStoreQueue,
        trackMode,
        setRoomUsers: setStoreRoomUsers,
        setCurrentUser: setStoreCurrentUser,
        setUsersTotal: setStoreUsersTotal,
        setLastReceivedUsersPage: setStoreLastReceivedUsersPage,
    } = useJukeboxStore();
    
    // Local state for component-specific needs
    const [track, setTrack] = useState<Track | null>(null);
    const [controls, setControls] = useState<PlayerControls | null>(null);
    const [isDancing, setIsDancing] = useState(false);
    const ws = useRef<WebSocket | null>(null);
    const isChangingTrackRef = useRef<boolean>(false);
    const isConnectingRef = useRef<boolean>(false);
    const currentRoomRef = useRef<string>("");

    // Sync local controls with store
    useEffect(() => {
        setStoreControls(controls);
    }, [controls, setStoreControls]);

    // Sync local track with store
    useEffect(() => {
        setStoreTrack(track);
    }, [track, setStoreTrack]);

    // Sync WebSocket with store
    useEffect(() => {
        setStoreWs(ws.current);
    }, [ws.current, setStoreWs]);

    // Reconnect when room changes (only if room is not empty)
    useEffect(() => {
        if (!currentRoom || currentRoom.trim() === "") {
            // No room selected, close connection if exists
            if (ws.current) {
                const oldWs = ws.current;
                ws.current = null;
                isConnectingRef.current = false;
                oldWs.close(1000); // Normal closure
            }
            currentRoomRef.current = "";
            // Clear track when room becomes empty
            setTrack(null);
            setStoreTrack(null);
            // Clear queue when leaving room
            setStoreQueue([]);
            if (controls) {
                controls.pause();
                controls.seek(0);
            }
            return;
        }

        // If room hasn't changed and we have an active connection, don't reconnect
        if (currentRoom === currentRoomRef.current && ws.current && ws.current.readyState === WebSocket.OPEN) {
            return;
        }

        // Prevent multiple simultaneous connections
        if (isConnectingRef.current) {
            return;
        }

        if (controls) {
            // Store the room we want to connect to
            const targetRoom = currentRoom;
            
            // Clear audio player first when switching rooms
            console.log("Clearing audio player for room switch");
            controls.pause();
            controls.seek(0);
            setTrack(null);
            setStoreTrack(null);
            
            // Close existing connection properly and wait for cleanup
            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                console.log("Closing existing connection to switch to room:", targetRoom);
                const oldWs = ws.current;
                ws.current = null; // Clear reference immediately
                oldWs.close(1000); // Normal closure code
            } else if (ws.current && ws.current.readyState === WebSocket.CONNECTING) {
                // If still connecting, close it
                console.log("Closing connecting WebSocket to switch to room:", targetRoom);
                const oldWs = ws.current;
                ws.current = null;
                oldWs.close(1000);
            } else if (ws.current && ws.current.readyState === WebSocket.CLOSED) {
                // Already closed, just clear it
                ws.current = null;
            }
            
            // Update ref to new room immediately
            currentRoomRef.current = targetRoom;
            
            // Wait for disconnect to be processed before connecting to new room
            isConnectingRef.current = true;
            setTimeout(() => {
                // Double-check room hasn't changed during timeout
                // and that we still want to connect to this room
                if (controls && targetRoom && targetRoom === currentRoomRef.current) {
                    // Only connect if we don't already have a connection
                    if (!ws.current || ws.current.readyState === WebSocket.CLOSED) {
                        console.log("Connecting to new room after timeout:", targetRoom);
                        connectToServer(targetRoom);
                    } else {
                        console.log("Already have connection, skipping");
                        isConnectingRef.current = false;
                    }
                } else {
                    console.log("Room changed during timeout, aborting connection");
                    isConnectingRef.current = false;
                }
            }, 300);
        } else if (!controls && currentRoom) {
            // Controls not ready yet, just update the ref
            currentRoomRef.current = currentRoom;
        }
    }, [currentRoom, controls]);

    const connectToServer = (roomSlug: string) => {
        console.log("connectToServer called for room:", roomSlug, "current ws state:", ws.current?.readyState);
        
        // Prevent duplicate connections
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            console.log("Connection already exists, closing before creating new one");
            ws.current.close(1000);
            ws.current = null;
        }
        
        // Clear any closed connections
        if (ws.current && ws.current.readyState === WebSocket.CLOSED) {
            console.log("Clearing closed connection");
            ws.current = null;
        }
        
        // Don't prevent connection if we're switching rooms - that's expected
        // Only prevent if we're already connecting to the same room
        if (isConnectingRef.current && ws.current && ws.current.readyState === WebSocket.CONNECTING) {
            console.log("Already connecting, skipping");
            return;
        }
        
        console.log("Creating new WebSocket connection to room:", roomSlug);
        isConnectingRef.current = true;
        const wsUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/^http/, "ws");
        ws.current = new WebSocket(`${wsUrl}/ws/${roomSlug}`);
        ws.current.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log("received", data);
            // Use store trackMode value
            const currentTrackMode = trackMode;
            if (data.type === "state_sync") {
                const trackData = data.payload.track;
                
                // First, clear the audio player
                controls?.pause();
                controls?.seek(0);
                setTrack(null);
                setStoreTrack(null);
                
                // Then, if there's a track in the new room, load it
                if (trackData) {
                    let newTrack: Track;
                    
                    // Backend now sends full track object
                    if (typeof trackData === "object" && trackData.url) {
                        newTrack = {
                            id: trackData.id || "1",
                            title: trackData.title || "Unknown",
                            artist: trackData.artist || "Unknown Artist",
                            source: (trackData.source || "html5") as "html5" | "youtube",
                            artwork: trackData.artwork || undefined,
                            url: trackData.url,
                        } as Track;
                    } else {
                        // Fallback for old format (just URL string)
                        newTrack = {
                            id: "1",
                            title: "Unknown",
                            artist: "Unknown Artist",
                            source: currentTrackMode,
                            artwork: undefined,
                            url: typeof trackData === "string" ? trackData : "",
                        } as Track;
                    }
                    
                    // Set the new track
                    setTrack(newTrack);
                    setStoreTrack(newTrack);
                    
                    // Seek to position and play if needed
                    controls?.seek(data.payload.position || 0);
                    console.log("seeked", data.payload.position || 0);
                    if (data.payload.is_playing === true) {
                        const serverTime = data.server_time;
                        const currentPos = serverTime - data.payload.start_time;
                        controls?.seek(Math.max(0, currentPos));
                        controls?.play();
                    }
                }
            } else if (data.type === "play" && data.payload && data.payload.start_time) {
                const serverTime = data.server_time;
                const currentPos = serverTime - data.payload.start_time;

                controls?.seek(Math.max(0, currentPos));
                controls?.play();
            } else if (data.type === "pause") {
                // audioPlayer.currentTime = data.payload.position;
                // audioPlayer.pause();
                controls?.seek(data.payload.position);
                controls?.pause();
            } else if (data.type === "seek") {
                const state = controls?.getState();
                const wasPlaying = state?.isPlaying;
                controls?.seek(data.payload.position);
                if (data.payload.is_playing === true) {
                    if (!wasPlaying) {
                        controls?.play();
                    }
                } else {
                    controls?.pause();
                }
            } else if (data.type === "set_track") {
                const trackData = data.payload.track;
                const shouldPlay = data.payload.is_playing === true;

                // Handle null track (queue is empty)
                if (trackData === null || trackData === undefined) {
                    setTrack(null);
                    setStoreTrack(null);
                    controls?.pause();
                    controls?.seek(0);
                    return;
                }

                // Backend now sends full track object
                if (typeof trackData === "object" && trackData.url) {
                    setTrack({
                        id: trackData.id || "1",
                        title: trackData.title || "Unknown",
                        artist: trackData.artist || "Unknown Artist",
                        source: (trackData.source || "html5") as "html5" | "youtube",
                        artwork: trackData.artwork || undefined,
                        url: trackData.url,
                    } as Track);
                } else {
                    // Fallback for old format (just URL string)
                    setTrack({
                        id: "1",
                        title: "Unknown",
                        artist: "Unknown Artist",
                        source: currentTrackMode,
                        artwork: undefined,
                        url: typeof trackData === "string" ? trackData : "",
                    } as Track);
                }

                controls?.seek(0);
                
                // Auto-play if backend indicates it should play
                if (shouldPlay) {
                    // Wait a bit for track to load, then play
                    setTimeout(() => {
                        controls?.play();
                    }, 100);
                } else {
                    controls?.pause();
                }
            } else if (data.type === "user_info") {
                // Update mode based on backend role
                const isHost = data.payload?.is_host || false;
                const isModerator = data.payload?.is_moderator || false;
                // If user is host or moderator, they're in "host" mode, otherwise "listener"
                const newMode = (isHost || isModerator) ? "host" : "listener";
                // Always update mode when receiving user_info (even if same, to handle room switches)
                console.log("Mode updated from backend:", newMode, "is_host:", isHost, "is_moderator:", isModerator);
                setStoreMode(newMode);
                
                // Store current user info for "myself" indicator (from user_info message)
                // Always update role from the payload to reflect current status (important when host leaves and new host is assigned)
                if (data.payload?.client_ip && data.payload?.client_port !== undefined) {
                    const newRole = isHost ? "host" : (isModerator ? "moderator" : "listener");
                    setStoreCurrentUser({
                        name: data.payload.name || "No name",
                        role: newRole, // Use role derived from is_host/is_moderator flags
                        client_ip: data.payload.client_ip,
                        client_port: data.payload.client_port,
                    });
                    console.log("Updated currentUser role to:", newRole, "from user_info", "is_host:", isHost, "is_moderator:", isModerator);
                } else {
                    // Even if IP/port not provided, update role if we have currentUser
                    const newRole = isHost ? "host" : (isModerator ? "moderator" : "listener");
                    // Get current user from store and update it
                    const { currentUser: prevUser } = useJukeboxStore.getState();
                    if (prevUser) {
                        setStoreCurrentUser({
                            ...prevUser,
                            role: newRole,
                        });
                        console.log("Updated currentUser role to:", newRole, "from user_info (no IP/port)");
                    }
                }
            } else if (data.type === "users_sync") {
                // Handle paginated users list from WebSocket
                const users = data.payload?.users || [];
                const page = data.payload?.page ?? 0;
                const total = data.payload?.total ?? users.length;
                const hasMore = data.payload?.has_more ?? false;
                
                console.log("Received users_sync:", { users, page, total, hasMore });
                
                // If it's the first page (page 0), replace the list, otherwise append
                if (page === 0) {
                    setStoreRoomUsers(users);
                } else {
                    // Get current users from store and merge
                    const { roomUsers: prevUsers } = useJukeboxStore.getState();
                    // Merge new users, avoiding duplicates based on client_ip and client_port
                    const existingKeys = new Set(
                        prevUsers.map((u: any) => `${u.client_ip}:${u.client_port}`)
                    );
                    const newUsers = users.filter(
                        (u: any) => !existingKeys.has(`${u.client_ip}:${u.client_port}`)
                    );
                    setStoreRoomUsers([...prevUsers, ...newUsers]);
                }
                
                setStoreUsersTotal(total);
                setStoreLastReceivedUsersPage(page);
                
                // Update currentUser role from users list if it matches
                // This ensures role is updated even if user_info message was missed
                const { currentUser: prevUser } = useJukeboxStore.getState();
                if (prevUser) {
                    // Check all users (including newly received ones)
                    const allUsers = page === 0 ? users : [...useJukeboxStore.getState().roomUsers, ...users];
                    const matchingUser = allUsers.find((u: any) => 
                        u.client_ip === prevUser.client_ip && 
                        String(u.client_port) === String(prevUser.client_port)
                    );
                    if (matchingUser && matchingUser.role !== prevUser.role) {
                        const newRole = matchingUser.is_host ? "host" : (matchingUser.is_moderator ? "moderator" : "listener");
                        setStoreCurrentUser({
                            ...prevUser,
                            role: newRole,
                        });
                        console.log("Updated currentUser role from users_sync:", newRole);
                    }
                }
            } else if (data.type === "queue_sync") {
                // Handle queue sync from backend
                const backendQueue = data.payload.queue || [];
                console.log("Received queue_sync:", backendQueue);
                // Convert backend queue format to QueueItem format
                const queueItems: import("./components/queue-search").QueueItem[] = backendQueue.map((item: any) => ({
                    id: String(item.id || ""),
                    title: item.title || "Unknown",
                    artist: item.artist || "Unknown Artist",
                    url: item.url || "",
                    source: (item.source || "html5") as "html5" | "youtube",
                    duration: item.duration,
                    artwork: item.artwork,
                    isSuggested: item.isSuggested || false,
                    votes: item.votes || 0,
                    userVote: item.userVote || null,
                    isPending: item.isPending || false,
                    video_id: item.video_id,
                }));
                console.log("Setting queue items:", queueItems);
                setStoreQueue(queueItems);
            } else if (data.type === "dance") {
                // Handle dance command - show GIF for 10 seconds
                setIsDancing(true);
                setTimeout(() => {
                    setIsDancing(false);
                }, 10000); // 10 seconds
            } else if (data.type === "next-track" || data.type === "previous-track") {
                const trackData = data.payload.track;
                const state = controls?.getState();
                const wasPlaying = state?.isPlaying || false;
                
                // Set flag to prevent duplicate commands during track change
                isChangingTrackRef.current = true;
                
                setTrack(trackData);
                controls?.seek(0);
                
                // Backend sets is_playing to False on track change, so we need to pause first
                // to sync with backend state, then play if it was playing before
                controls?.pause();
                
                // If it was playing, wait for track to load then play with retry logic
                // This allows autoplay to work on mobile after first user interaction
                if (wasPlaying) {
                    // Reliable autoplay: poll until track is ready, then play with retries
                    let attempts = 0;
                    const maxAttempts = 20; // 20 attempts * 150ms = 3 seconds max
                    const attemptInterval = 150; // Check every 150ms
                    
                    const tryPlay = () => {
                        attempts++;
                        const currentState = controls?.getState();
                        
                        // Check if track is loaded (duration > 0 indicates track is ready)
                        const isTrackReady = currentState?.duration && currentState.duration > 0;
                        
                        if (isTrackReady) {
                            // Track is ready, try to play
                            if (controls) {
                                controls.play().then(() => {
                                    // Play succeeded
                                    // If we're in host mode, send play command to sync with backend
                                    if (mode === "host") {
                                        const playData = {
                                            type: "play",
                                        };
                                        ws.current?.send(JSON.stringify(playData));
                                    }
                                    // Clear flag and request state sync
                                    setTimeout(() => {
                                        isChangingTrackRef.current = false;
                                        const syncData = {
                                            type: "get_state",
                                        };
                                        ws.current?.send(JSON.stringify(syncData));
                                    }, 300);
                                }).catch((error: unknown) => {
                                    // Play failed, retry if we haven't exceeded max attempts
                                    console.debug("Play attempt failed, retrying...", error);
                                    if (attempts < maxAttempts) {
                                        setTimeout(tryPlay, attemptInterval);
                                    } else {
                                        // Max attempts reached, give up
                                        console.debug("Max play attempts reached, giving up");
                                        isChangingTrackRef.current = false;
                                    }
                                });
                            } else {
                                // Controls not available, retry
                                if (attempts < maxAttempts) {
                                    setTimeout(tryPlay, attemptInterval);
                                } else {
                                    isChangingTrackRef.current = false;
                                }
                            }
                        } else {
                            // Track not ready yet, check again
                            if (attempts < maxAttempts) {
                                setTimeout(tryPlay, attemptInterval);
                            } else {
                                // Max attempts reached, give up
                                console.debug("Track did not load in time, giving up autoplay");
                                isChangingTrackRef.current = false;
                            }
                        }
                    };
                    
                    // Start trying after a small initial delay
                    setTimeout(tryPlay, 100);
                } else {
                    // If not playing, just clear the flag after a short delay
                    setTimeout(() => {
                        isChangingTrackRef.current = false;
                    }, 100);
                }

            }
        };

            ws.current.onopen = () => {
                console.log("socket opened to room:", roomSlug);
                isConnectingRef.current = false;
                // Update store WebSocket reference immediately
                setStoreWs(ws.current);
                // Request current queue and state when connected
                ws.current?.send(JSON.stringify({ type: "get_queue" }));
                ws.current?.send(JSON.stringify({ type: "get_state" }));
            };

        ws.current.onclose = (event) => {
            console.log("socket closed", event, "for room", roomSlug);
            isConnectingRef.current = false;
            // Clear connection reference
            const wasThisConnection = ws.current && ws.current.readyState === WebSocket.CLOSED;
            if (wasThisConnection) {
                ws.current = null;
            }
            // Clear current room when connection is lost (unless it was intentional disconnect)
            // Check if this was a normal close (code 1000) or an error/abnormal close
            // Code 1000 = normal closure, 1001 = going away, 1006 = abnormal closure
            // Only clear room if it's an abnormal close AND we're not switching rooms
            if (event.code !== 1000 && event.code !== 1001) {
                // Abnormal close (network error, server crash, etc.) - clear current room
                // But only if we're not in the process of switching rooms
                setTimeout(() => {
                    // Check if room hasn't changed (meaning we're not switching)
                    if (currentRoomRef.current === roomSlug) {
                        onRoomChange("");
                    }
                }, 100);
            }
        };

        ws.current.onerror = (event) => {
            console.log("socket error", event);
            isConnectingRef.current = false;
            // On error, clear current room after a short delay
            setTimeout(() => {
                onRoomChange("");
            }, 100);
        };
    };

    // Connect only after controls are ready AND a room is selected
    // This is handled by the room change effect above, so we don't need a separate effect here

    return (
        <div className="h-full flex flex-col">
            <AudioPlayer
                track={track}
                mode={mode}
                isDancing={isDancing}
                onNext={() => {
                    if (mode === "host" && ws.current && ws.current.readyState === WebSocket.OPEN) {
                        const data = {
                            type: "next-track",
                        };
                        ws.current.send(JSON.stringify(data));
                        console.log("sent", data);
                    }
                }}
                onPrevious={() => {
                    if (mode === "host" && ws.current && ws.current.readyState === WebSocket.OPEN) {
                        const data = {
                            type: "previous-track",
                        };
                        ws.current.send(JSON.stringify(data));
                        console.log("sent", data);
                    }
                }}
                onPlayerReady={(playerControls) => setControls(playerControls)}
                events={{
                    onPlay: () => {
                        // Don't send play command if we're in the middle of a track change
                        if (isChangingTrackRef.current) {
                            return;
                        }
                        if (mode === "host") {
                            const data = {
                                type: "play",
                            };
                            ws.current?.send(JSON.stringify(data));
                            console.log("sent", data);
                        }

                        const data = {
                            type: "get_state",
                        };
                        ws.current?.send(JSON.stringify(data));
                        console.log("sent", data);
                    },
                    onPause: () => {
                        // Don't send pause command if we're in the middle of a track change
                        if (isChangingTrackRef.current) {
                            return;
                        }
                        if (mode === "host") {
                            const data = {
                                type: "pause",
                            };
                            ws.current?.send(JSON.stringify(data));
                            console.log("sent", data);
                        }
                    },
                    onSeek: (time: number) => {
                        const data = {
                            type: "seek",
                            payload: {
                                position: time,
                            },
                        };
                        ws.current?.send(JSON.stringify(data));
                        console.log("sent", data);
                    },
                    onShuffleChange: () => {
                        if (mode === "host" && ws.current && ws.current.readyState === WebSocket.OPEN) {
                            const data = {
                                type: "shuffle_queue",
                            };
                            ws.current.send(JSON.stringify(data));
                            console.log("sent", data);
                        }
                    },
                    onRepeatChange: () => {
                        if (mode === "host" && ws.current && ws.current.readyState === WebSocket.OPEN) {
                            const data = {
                                type: "repeat_track",
                            };
                            ws.current.send(JSON.stringify(data));
                            console.log("sent", data);
                        }
                    },
                }}
            />
        </div>
    );
}

function MiddleBottom({ currentRoom }: { currentRoom: string }) {
    const { controls, ws, queue } = useJukeboxStore();
    
    return (
        <div className="h-full overflow-y-auto">
            <h2 className="text-2xl font-semibold mb-4">Home</h2>
            
            {/* Debug buttons */}
            <div className="flex flex-wrap gap-2">

                <Button onClick={() => {
                    const state = controls?.getState();
                    console.log("state", state);
                }}>Get State</Button>

                <Button onClick={() => {
                    controls?.play();
                }}>Play</Button>

                <Button onClick={() => {
                    const data = {
                        type: "get_state",
                    };
                    ws?.send(JSON.stringify(data));
                    console.log("sent", data);
                }}>Sync</Button>

                <Button onClick={() => {
                    const data = {
                        type: "next-track",
                    };
                    ws?.send(JSON.stringify(data));
                    console.log("sent", data);
                }}>Next Track</Button>

                <Button onClick={async () => {
                    if (!currentRoom || currentRoom.trim() === "") {
                        console.log("No room selected");
                        return;
                    }
                    
                    try {
                        const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
                        const response = await fetch(`${apiBase}/api/rooms/${encodeURIComponent(currentRoom)}/users`);
                        if (response.ok) {
                            const data = await response.json();
                            console.log(`Current room (${currentRoom}) users:`, data.users);
                            console.log(`Total users: ${data.users.length}`);
                            data.users.forEach((user: any, index: number) => {
                                console.log(`User ${index + 1}:`, user);
                            });
                        } else {
                            console.error("Failed to get users, status:", response.status);
                        }
                    } catch (error) {
                        console.error("Failed to get users:", error);
                    }
                }}>Debug: Get Current Room Users</Button>

                <Button onClick={() => {
                    console.log("Queue songs:", queue);
                    console.log(`Total queue items: ${queue.length}`);
                    queue.forEach((item, index) => {
                        console.log(`Queue item ${index + 1}:`, {
                            id: item.id,
                            title: item.title,
                            artist: item.artist,
                            url: item.url,
                            source: item.source,
                            duration: item.duration,
                            votes: item.votes,
                            isSuggested: item.isSuggested,
                            isPending: item.isPending,
                        });
                    });
                }}>Debug: Get Queue Songs</Button>

                <Button onClick={() => {
                    if (!ws || ws.readyState !== WebSocket.OPEN) {
                        console.log("WebSocket not connected");
                        return;
                    }
                    const data = {
                        type: "dance",
                    };
                    ws.send(JSON.stringify(data));
                    console.log("sent", data);
                }}>Debug: Send Dance</Button>
            </div>
        </div>
    );
}

// Left Sidebar Content Component - Always mounted, state preserved
function LeftSidebarContent({ isDrawer = false, onClose }: { isDrawer?: boolean; onClose?: () => void }) {
    // Use Zustand store - automatically re-renders when state changes
    const { currentTrack, queue, mode, ws } = useJukeboxStore();
    const currentTrackId = currentTrack?.id || null;
    
    return (
        <div className="h-full flex flex-col min-h-0">
            <QueueSearch 
                mode={mode} 
                isDrawer={isDrawer}
                onClose={onClose}
                currentTrackId={currentTrackId}
                queueItems={queue}
                ws={ws}
            />
        </div>
    );
}

// Right Sidebar Content Component - Always mounted, state preserved
function RightSidebarContent({ 
    isDrawer = false, 
    onClose,
    currentRoom,
    onRoomChange 
}: { 
    isDrawer?: boolean; 
    onClose?: () => void;
    currentRoom: string;
    onRoomChange: (room: string) => void;
}) {
    // Use Zustand store for WebSocket and users
    const { ws, roomUsers, currentUser, usersTotal, setRoomUsers, setUsersTotal, lastReceivedUsersPage } = useJukeboxStore();
    const [currentPage, setCurrentPage] = useState(0);
    const [hasMoreUsers, setHasMoreUsers] = useState(false);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const usersListRef = useRef<HTMLDivElement>(null);
    const loadingUsersPagesRef = useRef<Set<number>>(new Set());
    const USERS_PER_PAGE = 10;
    
    // Reset pagination when room changes
    useEffect(() => {
        setCurrentPage(0);
        setRoomUsers([]);
        setUsersTotal(0);
        setHasMoreUsers(false);
        loadingUsersPagesRef.current.clear();
        
        // Request first page when room changes
        if (currentRoom && currentRoom.trim() !== "" && ws && ws.readyState === WebSocket.OPEN) {
            if (!loadingUsersPagesRef.current.has(0)) {
                loadingUsersPagesRef.current.add(0);
                ws.send(JSON.stringify({
                    type: "get_users",
                    payload: {
                        page: 0,
                        limit: USERS_PER_PAGE,
                    }
                }));
            }
        }
    }, [currentRoom, ws, setRoomUsers, setUsersTotal]);
    
    // Handle infinite scroll for users list
    useEffect(() => {
        const usersListElement = usersListRef.current;
        if (!usersListElement) return;
        
        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = usersListElement;
            // Load more when scrolled to within 100px of bottom
            if (scrollHeight - scrollTop - clientHeight < 100 && hasMoreUsers && !isLoadingUsers && ws && ws.readyState === WebSocket.OPEN) {
                const nextPage = currentPage + 1;
                // Prevent duplicate requests for the same page
                if (loadingUsersPagesRef.current.has(nextPage)) {
                    return;
                }
                
                loadingUsersPagesRef.current.add(nextPage);
                setIsLoadingUsers(true);
                setCurrentPage(nextPage);
                
                ws.send(JSON.stringify({
                    type: "get_users",
                    payload: {
                        page: nextPage,
                        limit: USERS_PER_PAGE,
                    }
                }));
            }
        };
        
        usersListElement.addEventListener("scroll", handleScroll);
        return () => usersListElement.removeEventListener("scroll", handleScroll);
    }, [hasMoreUsers, isLoadingUsers, currentPage, ws]);
    
    // Update hasMoreUsers when usersTotal changes and clear loading state
    useEffect(() => {
        setHasMoreUsers(roomUsers.length < usersTotal);
        setIsLoadingUsers(false);
    }, [roomUsers.length, usersTotal]);
    
    // Clear loading page ref when users are received (prevents stuck loading states)
    useEffect(() => {
        // Clear the page that was just received from the loading set
        if (lastReceivedUsersPage !== null) {
            loadingUsersPagesRef.current.delete(lastReceivedUsersPage);
        }
    }, [lastReceivedUsersPage]);
    
    const handleToggleModerator = (targetUser: {
        name: string;
        role: string;
        client_ip: string;
        client_port?: string | number;
        is_host: boolean;
        is_moderator: boolean;
    }) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.warn("WebSocket not available for toggle moderator");
            return;
        }
        
        // Don't allow toggling moderator for yourself or the host
        if (targetUser.is_host) {
            console.warn("Cannot change moderator status for host");
            return;
        }
        
        const isCurrentlyModerator = targetUser.is_moderator;
        const newRole = isCurrentlyModerator ? "listener" : "moderator";
        
        console.log("Toggling moderator for user:", targetUser.name, "new role:", newRole);
        
        ws.send(JSON.stringify({
            type: "set_moderator",
            payload: {
                client_ip: targetUser.client_ip,
                client_port: targetUser.client_port,
                is_moderator: !isCurrentlyModerator,
            }
        }));
    };

    const handleRoomChange = (newRoom: string) => {
        onRoomChange(newRoom);
    };
    
    return (
        <div className="h-full flex flex-col min-h-0">
            {/* Header */}
            <div className="p-4 border-b">
                <div className="flex items-start justify-between mb-2">
                    <div>
                        <h2 className="text-2xl font-bold">Room Settings</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Join or create rooms
                        </p>
                    </div>
                    {/* Close button - only show in drawer mode */}
                    {isDrawer && onClose && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={onClose}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <RoomSelector
                    ws={ws}
                    currentRoom={currentRoom}
                    onRoomChange={handleRoomChange}
                />
                
                {/* Users List */}
                {currentRoom && currentRoom.trim() !== "" && (
                    <div className="mt-4 flex flex-col flex-1 min-h-0">
                        <h3 className="text-lg font-semibold mb-2 shrink-0">Users ({usersTotal > 0 ? usersTotal : roomUsers.length})</h3>
                        {roomUsers.length === 0 && !isLoadingUsers ? (
                            <p className="text-sm text-muted-foreground">No users in room</p>
                        ) : (
                            <div 
                                ref={usersListRef}
                                className="space-y-2 overflow-y-auto flex-1 min-h-0"
                            >
                                {roomUsers.map((user: {
                                    name: string;
                                    role: string;
                                    client_ip: string;
                                    client_port?: string | number;
                                    is_host: boolean;
                                    is_moderator: boolean;
                                }, index: number) => {
                                    const isMyself = currentUser && 
                                        user.client_ip === currentUser.client_ip && 
                                        String(user.client_port) === String(currentUser.client_port);
                                    
                                    // Only hosts (not moderators) can set moderator status
                                    const isCurrentUserHost = currentUser?.role === "host";
                                    const canToggleModerator = isCurrentUserHost && !user.is_host && !isMyself;
                                    
                                    return (
                                        <div 
                                            key={`${user.client_ip}-${user.client_port}-${index}`}
                                            className={cn(
                                                "p-3 border rounded-lg",
                                                isMyself ? "bg-primary/10 border-primary" : "bg-muted/50"
                                            )}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2">
                                                    {/* Checkbox for hosts to make moderators */}
                                                    {canToggleModerator && (
                                                        <input
                                                            type="checkbox"
                                                            checked={user.is_moderator}
                                                            onChange={() => handleToggleModerator(user)}
                                                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                                                        />
                                                    )}
                                                    <span className="font-medium">
                                                        {user.name}
                                                        {isMyself && (
                                                            <span className="ml-2 text-xs text-primary font-semibold">(You)</span>
                                                        )}
                                                    </span>
                                                    <span className={cn(
                                                        "text-xs px-2 py-0.5 rounded",
                                                        user.role === "host" && "bg-primary text-primary-foreground",
                                                        user.role === "moderator" && "bg-blue-500 text-white",
                                                        user.role === "listener" && "bg-muted text-muted-foreground"
                                                    )}>
                                                        {user.role}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-xs text-muted-foreground space-y-0.5">
                                                <div>IP: {user.client_ip}</div>
                                                <div>Port: {user.client_port}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {isLoadingUsers && (
                                    <div className="text-center py-2 text-sm text-muted-foreground">
                                        Loading more users...
                                    </div>
                                )}
                                {hasMoreUsers && !isLoadingUsers && (
                                    <div className="text-center py-2 text-sm text-muted-foreground">
                                        Scroll for more users...
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function Jukebox() {
    const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
    const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
    const [currentRoom, setCurrentRoom] = useState("");

    return (
        <div className="h-screen flex flex-col overflow-hidden">
            {/* Mobile Drawers - Always mounted, state preserved */}
            <StatefulDrawer
                open={leftDrawerOpen}
                onOpenChange={setLeftDrawerOpen}
                direction="left"
            >
                <LeftSidebarContent isDrawer={true} onClose={() => setLeftDrawerOpen(false)} />
            </StatefulDrawer>

            <StatefulDrawer
                open={rightDrawerOpen}
                onOpenChange={setRightDrawerOpen}
                direction="right"
            >
                <RightSidebarContent 
                    isDrawer={true} 
                    onClose={() => setRightDrawerOpen(false)}
                    currentRoom={currentRoom}
                    onRoomChange={setCurrentRoom}
                />
            </StatefulDrawer>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_2fr_1fr] grid-rows-[auto_1fr] gap-4 p-4 min-h-0">
                {/* Left Sidebar - Desktop */}
                <div className="hidden lg:block col-start-1 row-start-1 row-end-3 bg-card border rounded-lg overflow-hidden flex flex-col min-h-0">
                    <LeftSidebarContent />
                </div>

                {/* Top Middle - Audio Player */}
                <div className="col-start-1 lg:col-start-2 row-start-1 bg-card border rounded-lg px-4 py-2">
                    {/* Mobile: Header with drawer trigger buttons */}
                    <div className="flex items-center gap-2 mb-2 lg:hidden">
                        <Button 
                            variant="outline" 
                            size="icon"
                            onClick={() => setLeftDrawerOpen(true)}
                        >
                            <ListMusic className="h-4 w-4" />
                        </Button>
                        
                        <div className="flex-1 flex justify-center">
                            <h1 className="text-xl font-bold">Jukebox</h1>
                        </div>
                        
                        <Button 
                            variant="outline" 
                            size="icon"
                            onClick={() => setRightDrawerOpen(true)}
                        >
                            <Users className="h-4 w-4" />
                        </Button>
                    </div>
                    
                    {/* Desktop: Jukebox text above audio player */}
                    <div className="hidden lg:flex justify-center mb-2">
                        <h1 className="text-xl font-bold">Jukebox</h1>
                    </div>
                    
                    <AudioPlayerContainer currentRoom={currentRoom} onRoomChange={setCurrentRoom} />
                </div>

                {/* Bottom Middle - Content Area */}
                <div className="col-start-1 lg:col-start-2 row-start-2 bg-card border rounded-lg p-4 overflow-y-auto">
                    <MiddleBottom currentRoom={currentRoom} />
                </div>

                {/* Right Sidebar - Desktop */}
                <div className="hidden lg:block col-start-3 row-start-1 row-end-3 bg-card border rounded-lg overflow-hidden flex flex-col min-h-0">
                    <RightSidebarContent 
                        currentRoom={currentRoom}
                        onRoomChange={setCurrentRoom}
                    />
                </div>
            </div>
        </div>
    );
}

export default Jukebox;
