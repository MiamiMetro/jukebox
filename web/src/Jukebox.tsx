import { AudioPlayer, type PlayerControls } from "./components/audio-player";
import type { Track } from "./types/audio-player";
import { Button } from "./components/ui/button";
import { useEffect, useRef, useState } from "react";

import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "./components/ui/drawer";
import { Menu, X } from "lucide-react";

// Shared audio player state and websocket logic
let sharedControls: PlayerControls | null = null;
let sharedMode: "host" | "listener" = "host";
let sharedVariant: "full" | "mini" = "full";
let sharedWs: WebSocket | null = null;
const trackModeRef = { current: "html5" as "html5" | "youtube" };

// Callbacks to update shared state
let setSharedMode: ((mode: "host" | "listener") => void) | null = null;
let setSharedVariant: ((variant: "full" | "mini") => void) | null = null;

function AudioPlayerContainer() {
    const [track, setTrack] = useState<Track | null>(null);
    const [controls, setControls] = useState<PlayerControls | null>(null);
    const [mode, setMode] = useState<"host" | "listener">("host");
    const [variant, setVariant] = useState<"full" | "mini">("full");
    const ws = useRef<WebSocket | null>(null);
    const isChangingTrackRef = useRef<boolean>(false);

    const [trackMode] = useState<"html5" | "youtube">("html5");

    // Keep ref in sync with state
    useEffect(() => {
        trackModeRef.current = trackMode;
    }, [trackMode]);

    // Sync with shared state
    useEffect(() => {
        setSharedMode = setMode;
        setSharedVariant = setVariant;
        sharedControls = controls;
        sharedMode = mode;
        sharedVariant = variant;
        sharedWs = ws.current || null;
    }, [track, controls, mode, variant, trackMode]);

    const connectToServer = () => {
        ws.current = new WebSocket("ws://192.168.1.2:8000/ws");
        ws.current.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log("received", data);
            // Use ref to get the latest trackMode value
            const currentTrackMode = trackModeRef.current;
            if (data.type === "state_sync") {
                setTrack((prev: Track | null) => {
                    const trackData = data.payload.track;
                    if (!trackData) return prev;

                    // Backend now sends full track object
                    if (typeof trackData === "object" && trackData.url) {
                        return {
                            id: trackData.id || "1",
                            title: trackData.title || "Unknown",
                            artist: trackData.artist || "Unknown Artist",
                            source: (trackData.source || "html5") as "html5" | "youtube",
                            artwork: trackData.artwork || undefined,
                            url: trackData.url,
                        } as Track;
                    }

                    // Fallback for old format (just URL string)
                    return {
                        id: "1",
                        title: "Unknown",
                        artist: "Unknown Artist",
                        source: currentTrackMode,
                        artwork: undefined,
                        url: typeof trackData === "string" ? trackData : "",
                    } as Track;
                });


                controls?.seek(data.payload.position);
                console.log("seeked", data.payload.position);
                if (data.payload.is_playing === true) {
                    const serverTime = data.server_time;
                    const currentPos = serverTime - data.payload.start_time;
                    controls?.seek(Math.max(0, currentPos));
                    controls?.play();
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
                controls?.pause();
            } else if (data.type === "next-track") {
                const trackData = data.payload.track;
                const state = controls?.getState();
                const wasPlaying = state?.isPlaying || false;
                
                // Set flag to prevent duplicate commands during track change
                isChangingTrackRef.current = true;
                
                setTrack(trackData);
                controls?.seek(0);
                
                // Backend sets is_playing to False on next-track, so we need to pause first
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
            console.log("socket opened");
        };

        ws.current.onclose = (event) => {
            console.log("socket closed", event);
        };

        ws.current.onerror = (event) => {
            console.log("socket error", event);
        };
    };

    // Connect only after controls are ready
    useEffect(() => {
        if (controls && !ws.current) {
            console.log("connecting to server");
            connectToServer();
        }
        return () => {
            // cleanup on unmount
            if (!controls && ws.current) {
                console.log("disconnecting from server");
                ws.current.close();
                ws.current = null;
            }
        };
    }, [controls]);

    return (
        <div className="h-full flex flex-col">
            <AudioPlayer
                track={track}
                mode={mode}
                variant={variant}
                onNext={() => console.log("Next track")}
                onPrevious={() => console.log("Previous track")}
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
                }}
            />
        </div>
    );
}

function MiddleBottom() {
    return (
        <div className="h-full overflow-y-auto">
            <h2 className="text-2xl font-semibold mb-4">Home</h2>
            
            {/* Debug buttons */}
            <div className="flex flex-wrap gap-2">
                <Button onClick={() => {
                    const state = sharedControls?.getState();
                    console.log("state", state);
                    const newMode = sharedMode === "host" ? "listener" : "host";
                    if (setSharedMode) setSharedMode(newMode);
                }}>Mode</Button>

                <Button onClick={() => {
                    const newVariant = sharedVariant === "full" ? "mini" : "full";
                    if (setSharedVariant) setSharedVariant(newVariant);
                }}>Variant</Button>

                <Button onClick={() => {
                    const state = sharedControls?.getState();
                    console.log("state", state);
                }}>Get State</Button>

                <Button onClick={() => {
                    sharedControls?.play();
                }}>Play</Button>

                <Button onClick={() => {
                    const data = {
                        type: "get_state",
                    };
                    sharedWs?.send(JSON.stringify(data));
                    console.log("sent", data);
                }}>Sync</Button>

                <Button onClick={() => {
                    const data = {
                        type: "next-track",
                    };
                    sharedWs?.send(JSON.stringify(data));
                    console.log("sent", data);
                }}>Next Track</Button>
            </div>
        </div>
    );
}

function Jukebox() {
    const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
    const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

    const LeftSidebarContent = () => (
        <div className="h-full overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">Left Sidebar</h2>
            {/* Left sidebar content can go here */}
        </div>
    );

    const RightSidebarContent = () => (
        <div className="h-full overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">Right Sidebar</h2>
            {/* Right sidebar content can go here */}
        </div>
    );

    return (
        <div className="h-screen flex flex-col overflow-hidden">
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_2fr_1fr] grid-rows-[auto_1fr] gap-4 p-4">
                {/* Left Sidebar - Desktop */}
                <div className="hidden lg:block col-start-1 row-start-1 row-end-3 bg-card border rounded-lg p-4 overflow-y-auto">
                    <LeftSidebarContent />
                </div>

                {/* Top Middle - Audio Player with drawer triggers on mobile */}
                <div className="col-start-1 lg:col-start-2 row-start-1 bg-card border rounded-lg px-4 py-2">
                    {/* Mobile: Hamburger buttons with Jukebox text in middle */}
                    <div className="flex items-center gap-2 mb-2 lg:hidden">
                        <Drawer open={leftDrawerOpen} onOpenChange={setLeftDrawerOpen} direction="left">
                            <DrawerTrigger asChild>
                                <Button variant="outline" size="icon">
                                    <Menu className="h-4 w-4" />
                                </Button>
                            </DrawerTrigger>
                            <DrawerContent className="max-w-sm">
                                <DrawerHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <DrawerTitle>Left Sidebar</DrawerTitle>
                                            <DrawerDescription>Navigation and controls</DrawerDescription>
                                        </div>
                                        <DrawerClose asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </DrawerClose>
                                    </div>
                                </DrawerHeader>
                                <div className="p-4 overflow-y-auto">
                                    <LeftSidebarContent />
                                </div>
                            </DrawerContent>
                        </Drawer>
                        <div className="flex-1 flex justify-center">
                            <h1 className="text-xl font-bold">Jukebox</h1>
                        </div>
                        <Drawer open={rightDrawerOpen} onOpenChange={setRightDrawerOpen} direction="right">
                            <DrawerTrigger asChild>
                                <Button variant="outline" size="icon">
                                    <Menu className="h-4 w-4" />
                                </Button>
                            </DrawerTrigger>
                            <DrawerContent className="max-w-sm">
                                <DrawerHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <DrawerTitle>Right Sidebar</DrawerTitle>
                                            <DrawerDescription>Additional information</DrawerDescription>
                                        </div>
                                        <DrawerClose asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </DrawerClose>
                                    </div>
                                </DrawerHeader>
                                <div className="p-4 overflow-y-auto">
                                    <RightSidebarContent />
                                </div>
                            </DrawerContent>
                        </Drawer>
                    </div>
                    {/* Desktop: Jukebox text above audio player */}
                    <div className="hidden lg:flex justify-center mb-2">
                        <h1 className="text-xl font-bold">Jukebox</h1>
                    </div>
                    <AudioPlayerContainer />
                </div>

                {/* Bottom Middle - Content Area */}
                <div className="col-start-1 lg:col-start-2 row-start-2 bg-card border rounded-lg p-4 overflow-y-auto">
                    <MiddleBottom />
                </div>

                {/* Right Sidebar - Desktop */}
                <div className="hidden lg:block col-start-3 row-start-1 row-end-3 bg-card border rounded-lg p-4 overflow-y-auto">
                    <RightSidebarContent />
                </div>
            </div>
        </div>
    );
}

export default Jukebox;
