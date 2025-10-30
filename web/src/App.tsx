import { Routes, Route, Link } from "react-router-dom";
import { AudioPlayer, type PlayerControls } from "./components/audio-player";
import type { Track } from "./types/audio-player";
import { Button } from "./components/ui/button";
import { useEffect, useRef, useState } from "react";

function Home() {
    const [track, setTrack] = useState<Track | null>(null);
    const [controls, setControls] = useState<PlayerControls | null>(null);
    const [mode, setMode] = useState<"host" | "listener">("host");
    const [variant, setVariant] = useState<"full" | "mini">("full");
    const ws = useRef<WebSocket | null>(null);

    const connectToServer = () => {
        ws.current = new WebSocket("ws://localhost:8000/ws");
        ws.current.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "state_sync") {
                console.log("state_sync", data);

                setTrack((prev: Track | null) => {
                    if (!data.payload.track) return prev;
                    return {
                        id: "1",
                        title: "My Song",
                        artist: "Artist Name",
                        source: "html5",
                        artwork: "https://picsum.photos/1500",
                        url: data.payload.track,
                    } as Track;
                });

                const state = data.payload;
                const serverTime = data.server_time;
                const currentPos = serverTime - state.start_time;
                controls?.seek(Math.max(0, currentPos));
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
                        const data = {
                            type: "get_state",
                        };
                        ws.current?.send(JSON.stringify(data));
                        console.log("sent", data);
                        
                        if (mode === "host") {
                            const data = {
                                type: "play",
                            };
                            ws.current?.send(JSON.stringify(data));
                            console.log("sent", data);
                        }
                    },
                    onPause: () => {
                        const data = {
                            type: "pause",
                        };
                        ws.current?.send(JSON.stringify(data));
                        console.log("sent", data);
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
