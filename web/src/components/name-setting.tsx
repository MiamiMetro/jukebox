import { useState, useEffect } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useJukeboxStore } from "../store/jukebox-store";

const MAX_NAME_LENGTH = 16;

export function NameSetting({ currentRoom }: { currentRoom: string }) {
    const { currentUser, setCurrentUser, ws } = useJukeboxStore();
    const [name, setName] = useState(currentUser?.name || "");
    const [isEditing, setIsEditing] = useState(false);

    // Load name from localStorage on mount
    useEffect(() => {
        const savedName = localStorage.getItem("jukebox_user_name");
        if (savedName) {
            const limitedName = savedName.slice(0, MAX_NAME_LENGTH);
            setName(limitedName);
            // Update store if we have currentUser
            if (currentUser) {
                setCurrentUser({
                    ...currentUser,
                    name: limitedName,
                });
            }
        } else if (currentUser?.name && currentUser.name !== "No name") {
            setName(currentUser.name.slice(0, MAX_NAME_LENGTH));
        }
    }, []);

    // Send name to backend when joining a room (if we have a saved name)
    useEffect(() => {
        if (!currentRoom || currentRoom.trim() === "" || !ws || ws.readyState !== WebSocket.OPEN) {
            return;
        }

        const savedName = localStorage.getItem("jukebox_user_name");
        if (savedName && savedName.trim() !== "" && savedName !== "No name") {
            const limitedName = savedName.slice(0, MAX_NAME_LENGTH);
            // Send name to backend
            ws.send(
                JSON.stringify({
                    type: "set_name",
                    payload: {
                        name: limitedName,
                    },
                })
            );
        }
    }, [currentRoom, ws]);

    // Sync with store when currentUser changes
    useEffect(() => {
        if (currentUser?.name && currentUser.name !== "No name") {
            const limitedName = currentUser.name.slice(0, MAX_NAME_LENGTH);
            setName(limitedName);
        }
    }, [currentUser?.name]);

    const handleSave = () => {
        const trimmedName = name.trim() || "No name";
        const limitedName = trimmedName.slice(0, MAX_NAME_LENGTH);
        setName(limitedName);
        localStorage.setItem("jukebox_user_name", limitedName);
        
        // Send to backend via WebSocket if connected
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
                JSON.stringify({
                    type: "set_name",
                    payload: {
                        name: limitedName,
                    },
                })
            );
        }
        
        // Update store (will be updated from backend response)
        if (currentUser) {
            setCurrentUser({
                ...currentUser,
                name: limitedName,
            });
        }
        
        setIsEditing(false);
    };

    const handleCancel = () => {
        setName(currentUser?.name || localStorage.getItem("jukebox_user_name") || "");
        setIsEditing(false);
    };

    return (
        <div className="border-b pb-4 mb-4">
            <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">Your Name:</label>
                {isEditing ? (
                    <div className="flex items-center gap-2 flex-1">
                        <Input
                            value={name}
                            onChange={(e) => {
                                const value = e.target.value.slice(0, MAX_NAME_LENGTH);
                                setName(value);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleSave();
                                } else if (e.key === "Escape") {
                                    handleCancel();
                                }
                            }}
                            className="flex-1"
                            placeholder={`Enter your name`}
                            autoFocus
                            maxLength={MAX_NAME_LENGTH}
                        />
                        <Button size="sm" onClick={handleSave}>
                            Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleCancel}>
                            Cancel
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 flex-1">
                        <span className="text-sm text-muted-foreground flex-1">
                            {currentUser?.name || name || "No name"}
                        </span>
                        <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                            Edit
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
