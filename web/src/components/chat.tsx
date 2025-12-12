import { useState, useEffect, useRef } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useJukeboxStore } from "../store/jukebox-store";
import { Send, Trash2, Star } from "lucide-react";
import { cn } from "../lib/utils";

interface ChatMessage {
    id: string;
    name: string;
    message: string;
    timestamp: number;
    role: "host" | "moderator" | "listener";
    is_deleted: boolean;
    is_system?: boolean; // For system messages (joins/leaves)
}

const MAX_MESSAGES = 50; // Keep only last 50 messages in frontend
const MAX_MESSAGE_LENGTH = 400; // Max characters per message

export function Chat({ currentRoom }: { currentRoom: string }) {
    const { ws, currentUser, roomUsers, roomSettings, queue } = useJukeboxStore();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputMessage, setInputMessage] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const prevUsersRef = useRef<Map<string, { name: string; role: string }>>(new Map());
    const prevQueueIdsRef = useRef<Set<string>>(new Set());
    const isAtBottomRef = useRef<boolean>(true);

    // Clear messages when room changes
    useEffect(() => {
        setMessages([]);
        prevUsersRef.current.clear();
        prevQueueIdsRef.current.clear();
        isAtBottomRef.current = true; // Reset to bottom when room changes
    }, [currentRoom]);

    // Track user joins/leaves for system messages
    useEffect(() => {
        if (!currentRoom || roomUsers.length === 0) {
            // If room is empty, clear previous users
            if (roomUsers.length === 0) {
                prevUsersRef.current.clear();
            }
            return;
        }

        const currentUsersMap = new Map<string, { name: string; role: string }>();
        roomUsers.forEach((user: any) => {
            const userKey = `${user.client_ip}:${user.client_port}`;
            currentUsersMap.set(userKey, { name: user.name, role: user.role });
        });

        // Find new users (joined)
        roomUsers.forEach((user: any) => {
            const userKey = `${user.client_ip}:${user.client_port}`;
            if (!prevUsersRef.current.has(userKey) && prevUsersRef.current.size > 0) {
                // User joined (not the first load) - anonymous message
                const systemMessage: ChatMessage = {
                    id: `system-join-${Date.now()}-${Math.random()}`,
                    name: "System",
                    message: "Someone joined the room",
                    timestamp: Date.now() / 1000,
                    role: "listener",
                    is_deleted: false,
                    is_system: true,
                };
                setMessages((prev) => {
                    const updated = [...prev, systemMessage];
                    // Keep only last 50 messages
                    return updated.slice(-MAX_MESSAGES);
                });
            }
        });

        // Find users who left
        prevUsersRef.current.forEach((_userData, userKey) => {
            if (!currentUsersMap.has(userKey)) {
                // User left - anonymous message
                const systemMessage: ChatMessage = {
                    id: `system-leave-${Date.now()}-${Math.random()}`,
                    name: "System",
                    message: "Someone left the room",
                    timestamp: Date.now() / 1000,
                    role: "listener",
                    is_deleted: false,
                    is_system: true,
                };
                setMessages((prev) => {
                    const updated = [...prev, systemMessage];
                    // Keep only last 50 messages
                    return updated.slice(-MAX_MESSAGES);
                });
            }
        });

        // Update previous users
        prevUsersRef.current = currentUsersMap;
    }, [roomUsers, currentRoom]);

    // Track queue changes for system messages
    useEffect(() => {
        if (!currentRoom || queue.length === 0) {
            // If queue is empty, clear previous queue IDs
            if (queue.length === 0) {
                prevQueueIdsRef.current.clear();
            }
            return;
        }

        const currentQueueIds = new Set(queue.map(item => item.id));
        
        // Find new items added to queue (not in previous queue)
        queue.forEach((item) => {
            if (!prevQueueIdsRef.current.has(item.id) && prevQueueIdsRef.current.size > 0) {
                // Item added (not the first load) - anonymous message
                // Different message for suggested items vs directly added items
                const message = item.isSuggested 
                    ? `"${item.title}" by ${item.artist} was suggested for voting`
                    : `"${item.title}" by ${item.artist} was added to the queue`;
                
                const systemMessage: ChatMessage = {
                    id: `system-queue-add-${Date.now()}-${Math.random()}`,
                    name: "System",
                    message: message,
                    timestamp: Date.now() / 1000,
                    role: "listener",
                    is_deleted: false,
                    is_system: true,
                };
                setMessages((prev) => {
                    const updated = [...prev, systemMessage];
                    // Keep only last 50 messages
                    return updated.slice(-MAX_MESSAGES);
                });
            }
        });

        // Update previous queue IDs
        prevQueueIdsRef.current = currentQueueIds;
    }, [queue, currentRoom]);

    // Check if user is at bottom of chat
    const checkIfAtBottom = () => {
        if (!chatContainerRef.current) return false;
        const container = chatContainerRef.current;
        const threshold = 100; // Consider "at bottom" if within 100px of bottom
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
        isAtBottomRef.current = isAtBottom;
        return isAtBottom;
    };

    // Track scroll position to determine if user is at bottom
    useEffect(() => {
        const container = chatContainerRef.current;
        if (!container) return;

        const handleScroll = () => {
            checkIfAtBottom();
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, []);

    // Scroll to bottom when new messages arrive (only if user is already at bottom)
    useEffect(() => {
        if (messagesEndRef.current && chatContainerRef.current && isAtBottomRef.current) {
            // Only scroll if user is already at the bottom
            chatContainerRef.current.scrollTo({
                top: chatContainerRef.current.scrollHeight,
                behavior: "smooth"
            });
        } else if (chatContainerRef.current) {
            // Update the ref even if we don't scroll
            checkIfAtBottom();
        }
    }, [messages]);

    // Listen for chat messages from WebSocket
    useEffect(() => {
        if (!ws) return;

        const handleMessage = (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === "chat_history") {
                    // Received chat history for late joiners
                    const historyMessages: ChatMessage[] = (data.payload.messages || []).map((msg: any) => ({
                        id: msg.id,
                        name: msg.name,
                        message: msg.message,
                        timestamp: msg.timestamp,
                        role: msg.role || "listener",
                        is_deleted: msg.is_deleted || false,
                        is_system: false,
                    }));
                    setMessages(historyMessages.slice(-MAX_MESSAGES));
                    // Always scroll to bottom when loading history (initial load)
                    setTimeout(() => {
                        if (chatContainerRef.current) {
                            chatContainerRef.current.scrollTo({
                                top: chatContainerRef.current.scrollHeight,
                                behavior: "auto"
                            });
                            isAtBottomRef.current = true;
                        }
                    }, 0);
                } else if (data.type === "chat_message") {
                    // New chat message
                    const newMessage: ChatMessage = {
                        id: data.payload.id,
                        name: data.payload.name || "Unknown",
                        message: data.payload.message || "",
                        timestamp: data.payload.timestamp || data.server_time || Date.now() / 1000,
                        role: data.payload.role || "listener",
                        is_deleted: false,
                        is_system: false,
                    };
                    setMessages((prev) => {
                        const updated = [...prev, newMessage];
                        // Keep only last 50 messages
                        return updated.slice(-MAX_MESSAGES);
                    });
                } else if (data.type === "chat_message_deleted") {
                    // Message was deleted (marked as deleted)
                    const messageId = data.payload.message_id;
                    setMessages((prev) =>
                        prev.map((msg) =>
                            msg.id === messageId ? { ...msg, is_deleted: true } : msg
                        )
                    );
                } else if (data.type === "chat_cleared") {
                    // Clear all messages
                    setMessages([]);
                    isAtBottomRef.current = true;
                }
            } catch (e) {
                // Not a chat message, ignore
            }
        };

        ws.addEventListener("message", handleMessage);
        return () => ws.removeEventListener("message", handleMessage);
    }, [ws]);

    const handleSend = () => {
        const trimmedMessage = inputMessage.trim();
        if (!trimmedMessage || !currentRoom || !ws || ws.readyState !== WebSocket.OPEN) return;

        // Limit message length
        const limitedMessage = trimmedMessage.slice(0, MAX_MESSAGE_LENGTH);

        // Send to backend via WebSocket
        ws.send(
            JSON.stringify({
                type: "chat_message",
                payload: {
                    message: limitedMessage,
                },
            })
        );
        
        setInputMessage("");
    };

    const handleDelete = (messageId: string) => {
        if (!ws || ws.readyState !== WebSocket.OPEN || !currentUser) return;
        
        // Only hosts and moderators can delete
        if (currentUser.role !== "host" && currentUser.role !== "moderator") return;

        ws.send(
            JSON.stringify({
                type: "delete_chat_message",
                payload: {
                    message_id: messageId,
                },
            })
        );
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    const getRoleColor = (role: string) => {
        if (role === "host") {
            return "text-primary font-semibold";
        } else if (role === "moderator") {
            return "text-blue-500 font-medium";
        }
        return "text-foreground";
    };

    const canDelete = currentUser?.role === "host" || currentUser?.role === "moderator";

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Messages container */}
            <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto space-y-2 mb-4 pr-2"
                style={{
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-y'
                }}
            >
                {messages.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-8">
                        No messages yet. Start the conversation!
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg.id} className={cn("flex flex-col gap-1 group min-w-0 w-full", msg.is_system && "opacity-70")}>
                            <div className="flex items-baseline gap-2 justify-between min-w-0 w-full">
                                <div className="flex items-baseline gap-2 flex-1 min-w-0">
                                    {msg.is_system ? (
                                        <span className="text-xs text-muted-foreground italic break-words" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                            {msg.message}
                                        </span>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <span className={cn("text-sm", getRoleColor(msg.role))}>
                                                    {msg.name}
                                                </span>
                                                {msg.role === "host" && (
                                                    <Star className="h-3 w-3 fill-foreground text-foreground" />
                                                )}
                                                {msg.role === "moderator" && (
                                                    <Star className="h-3 w-3 fill-blue-500 text-blue-500" />
                                                )}
                                            </div>
                                            <span className="text-xs text-muted-foreground shrink-0">
                                                {formatTime(msg.timestamp)}
                                            </span>
                                        </>
                                    )}
                                </div>
                                {!msg.is_system && canDelete && !msg.is_deleted && (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                        onClick={() => handleDelete(msg.id)}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>
                            {!msg.is_system && (
                                <div
                                    className={cn(
                                        "text-sm rounded-md p-2 break-words w-full min-w-0",
                                        msg.is_deleted
                                            ? "bg-muted/30 text-muted-foreground italic"
                                            : "bg-muted/50"
                                    )}
                                    style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                                >
                                    {msg.is_deleted ? (
                                        <span className="text-xs">[Message deleted]</span>
                                    ) : (
                                        msg.message
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

                    {/* Input area */}
                    <div className="flex gap-2 shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}>
                        <Input
                            value={inputMessage}
                            onChange={(e) => {
                                const value = e.target.value.slice(0, MAX_MESSAGE_LENGTH);
                                setInputMessage(value);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder={
                                roomSettings && !roomSettings.chat_enabled && currentUser?.role !== "host" && currentUser?.role !== "moderator"
                                    ? "Chat is disabled"
                                    : "Type a message..."
                            }
                            disabled={
                                !currentRoom || 
                                currentRoom.trim() === "" || 
                                !ws || 
                                ws.readyState !== WebSocket.OPEN ||
                                (roomSettings?.chat_enabled === false && currentUser?.role !== "host" && currentUser?.role !== "moderator")
                            }
                            className="flex-1"
                            maxLength={MAX_MESSAGE_LENGTH}
                        />
                        <Button
                            onClick={handleSend}
                            disabled={
                                !inputMessage.trim() || 
                                !currentRoom || 
                                currentRoom.trim() === "" || 
                                !ws || 
                                ws.readyState !== WebSocket.OPEN ||
                                (roomSettings?.chat_enabled === false && currentUser?.role !== "host" && currentUser?.role !== "moderator")
                            }
                            size="icon"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
        </div>
    );
}
