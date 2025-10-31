import { Routes, Route, Link } from "react-router-dom";
import { AudioPlayer, type PlayerControls } from "./components/audio-player";
import type { Track } from "./types/audio-player";
import { Button } from "./components/ui/button";
import { useEffect, useRef, useState } from "react";
import { Input } from "./components/ui/input";

function Home() {
    const [track, setTrack] = useState<Track | null>(null);
    const [controls, setControls] = useState<PlayerControls | null>(null);
    const [mode, setMode] = useState<"host" | "listener">("host");
    const [variant, setVariant] = useState<"full" | "mini">("full");
    const ws = useRef<WebSocket | null>(null);

    const [trackUrl, setTrackUrl] = useState<string>("");
    const [trackMode, setTrackMode] = useState<"html5" | "youtube">("html5");
    const trackModeRef = useRef<"html5" | "youtube">("html5");

    // Keep ref in sync with state
    useEffect(() => {
        trackModeRef.current = trackMode;
    }, [trackMode]);

    const connectToServer = () => {
        ws.current = new WebSocket("ws://192.168.1.2:8000/ws");
        ws.current.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log("received", data);
            // Use ref to get the latest trackMode value
            const currentTrackMode = trackModeRef.current;
            if (data.type === "state_sync") {
                setTrack((prev: Track | null) => {
                    if (!data.payload.track) return prev;
                    return {
                        id: "1",
                        title: "My Song",
                        artist: "Artist Name",
                        source: currentTrackMode,
                        artwork: "https://picsum.photos/1500",
                        url: data.payload.track,
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
            } else if (data.payload && data.payload.start_time) {
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
                setTrack(() => {
                    return {
                        id: "1",
                        title: "New Song",
                        artist: "New Artist",
                        source: currentTrackMode,
                        artwork: "https://picsum.photos/1500",
                        url: data.payload.track,
                    } as Track;
                });
                console.log({
                    id: "1",
                    title: "New Song",
                    artist: "New Artist",
                    source: currentTrackMode,
                    artwork: "https://picsum.photos/1500",
                    url: data.payload.track,
                })
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
        <div className="p-4">
            <h2 className="text-2xl font-semibold">Home</h2>

            <AudioPlayer
                track={track}
                mode={mode}
                variant={variant}
                onNext={() => console.log("Next track")}
                onPrevious={() => console.log("Previous track")}
                onPlayerReady={(playerControls) => setControls(playerControls)}
                events={{
                    onPlay: () => {
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

            {/* Debug buttons */}
            <Button onClick={() => {
                const state = controls?.getState();
                console.log("state", state);
                setMode((prev) => prev === "host" ? "listener" : "host");
            }} className="m-2">Mode</Button>

            <Button onClick={() => {
                setVariant((prev) => prev === "full" ? "mini" : "full");
            }} className="m-2">Variant</Button>

            <Button onClick={() => {
                connectToServer();
            }} className="m-2">Connect to Server</Button>

            <Button onClick={() => {
                ws.current?.close();
            }} className="m-2">Disconnect from Server</Button>

            <Button onClick={() => {
                const state = controls?.getState();
                console.log("state", state);
            }} className="m-2">Get State</Button>

            <Button onClick={() => {
                controls?.play();
            }} className="m-2">Play</Button>

            <Button onClick={() => {
                const data = {
                    type: "get_state",
                };
                ws.current?.send(JSON.stringify(data));
                console.log("sent", data);
            }} className="m-2">Sync</Button>

            <Input type="text" placeholder="Track URL" value={trackUrl} onChange={(e) => setTrackUrl(e.target.value)} />
            <Button onClick={() => {
                const data = {
                    type: "set_track",
                    payload: {
                        track: trackUrl,
                    },
                };
                ws.current?.send(JSON.stringify(data));
                console.log("sent", data);
            }} className="m-2">Set Track</Button>
            <Button onClick={() => {
                setTrackMode((prev) => prev === "html5" ? "youtube" : "html5");
            }} className="m-2">Track Mode: {trackMode}</Button>
        </div>
    );
}

function About() {
    return (
        <div className="p-4">
            <h2 className="text-2xl font-semibold">About</h2>
            <p className="mt-2">
                This is a small demo of React Router + React Query.
            </p>

            <AudioPlayer
                track={{
                    id: "1",
                    title: "My Song",
                    artist: "Artist Name",
                    source: "youtube",
                    artwork: "https://picsum.photos/1500",
                    url: "https://www.youtube.com/watch?v=HQf8eMu3zP0",
                }}
                mode="host"
                variant="full"
                onNext={() => console.log("Next track")}
                onPrevious={() => console.log("Previous track")}
            />
        </div>
    );
}

function App() {
    return (
        <>
            <header className="p-4 bg-gray-100">
                <nav className="flex gap-4">
                    <Link to="/" className="text-blue-600">
                        Home
                    </Link>
                    <Link to="/about" className="text-blue-600">
                        About
                    </Link>
                </nav>
            </header>

            <main className="p-4">
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/about" element={<About />} />
                </Routes>
            </main>
        </>
    );
}

export default App;
