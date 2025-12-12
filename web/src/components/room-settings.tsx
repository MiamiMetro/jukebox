import { useState, useEffect } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { useJukeboxStore } from "../store/jukebox-store";
import { Settings, Trash2 } from "lucide-react";

export function RoomSettings() {
    const { ws, roomSettings, setRoomSettings, currentUser } = useJukeboxStore();
    const [isSaving, setIsSaving] = useState(false);

    // Use store settings or default
    const settings = roomSettings || {
        chat_enabled: true,
        voting_enabled: true,
        voting_duration: 10.0,
        voting_duration_enabled: true,
    };

    // Listen for room_settings updates from WebSocket
    useEffect(() => {
        if (!ws) return;

        const handleMessage = (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "room_settings") {
                    setRoomSettings(data.payload);
                }
            } catch (e) {
                // Not a settings message, ignore
            }
        };

        ws.addEventListener("message", handleMessage);
        return () => ws.removeEventListener("message", handleMessage);
    }, [ws, setRoomSettings]);

    // Only show for hosts and moderators (check after hooks)
    const isHostOrMod = currentUser?.role === "host" || currentUser?.role === "moderator";
    if (!isHostOrMod) {
        return null;
    }

    const handleUpdate = async (key: string, value: any) => {
        // Optimistically update local state
        const newSettings = { ...settings, [key]: value };
        setRoomSettings(newSettings);

        // Send update to backend
        if (ws && ws.readyState === WebSocket.OPEN) {
            setIsSaving(true);
            ws.send(JSON.stringify({
                type: "update_room_settings",
                payload: {
                    settings: {
                        [key]: value
                    }
                }
            }));
            // Reset saving state after a short delay
            setTimeout(() => setIsSaving(false), 500);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                <h3 className="text-lg font-semibold">Room Settings</h3>
            </div>

                    {/* Chat Enabled */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="chat-enabled">Chat Enabled</Label>
                            <p className="text-sm text-muted-foreground">
                                When disabled, only hosts/moderators can chat
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            id="chat-enabled"
                            checked={settings.chat_enabled}
                            onChange={(e) => handleUpdate("chat_enabled", e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                        />
                    </div>

                    {/* Voting Enabled */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="voting-enabled">Voting Enabled</Label>
                            <p className="text-sm text-muted-foreground">
                                When disabled, listeners can't suggest items
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            id="voting-enabled"
                            checked={settings.voting_enabled}
                            onChange={(e) => handleUpdate("voting_enabled", e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                        />
                    </div>

                    {/* Voting Duration */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="voting-duration-enabled">Voting Duration</Label>
                                <p className="text-sm text-muted-foreground">
                                    Enable time limit for voting
                                </p>
                            </div>
                            <input
                                type="checkbox"
                                id="voting-duration-enabled"
                                checked={settings.voting_duration_enabled}
                                onChange={(e) => handleUpdate("voting_duration_enabled", e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                            />
                        </div>

                {settings.voting_duration_enabled && (
                    <div className="flex items-center gap-2">
                        <Label htmlFor="voting-duration" className="whitespace-nowrap">
                            Duration (seconds):
                        </Label>
                        <Input
                            id="voting-duration"
                            type="number"
                            min="1"
                            max="300"
                            step="1"
                            value={settings.voting_duration}
                            onChange={(e) => {
                                const value = parseFloat(e.target.value);
                                if (!isNaN(value) && value > 0) {
                                    handleUpdate("voting_duration", value);
                                }
                            }}
                            className="w-24"
                        />
                        <p className="text-xs text-muted-foreground">
                            {settings.voting_duration_enabled 
                                ? `Auto-approve after ${settings.voting_duration}s`
                                : "Infinite (manual approval only)"}
                        </p>
                    </div>
                )}

                {!settings.voting_duration_enabled && (
                    <p className="text-xs text-muted-foreground italic">
                        Voting duration disabled - items require manual approval
                    </p>
                )}
            </div>

            {isSaving && (
                <p className="text-xs text-muted-foreground">Saving...</p>
            )}

            {/* Clear Chat Button */}
            <div className="pt-4 border-t">
                <Button
                    onClick={() => {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: "clear_chat",
                                payload: {}
                            }));
                        }
                    }}
                    className="w-full"
                >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear Chat
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                    Remove all chat messages from the room
                </p>
            </div>
        </div>
    );
}

