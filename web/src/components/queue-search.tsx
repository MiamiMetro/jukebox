import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import type { Track } from "@/types/audio-player";
import { ChevronUp, ChevronDown, Trash2, Check, X, Music2, Play, Plus, Vote, Youtube, FileAudio } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useJukeboxStore } from "../store/jukebox-store";

// Extended track type for queue items with voting
export interface QueueItem extends Track {
    isSuggested?: boolean;
    votes?: number;
    userVote?: "up" | "down" | null;
    isNext?: boolean; // Manual flag for "Next" indicator
    isPending?: boolean; // Item is pending download
    video_id?: string; // Video ID for pending downloads
    voting_end_time?: number; // Timestamp when voting ends
}

interface QueueSearchProps {
    mode: "host" | "listener";
    isDrawer?: boolean;
    onClose?: () => void;
    currentTrackId?: string | null;
    // Backend integration props - pass these to connect to backend
    queueItems?: QueueItem[]; // If provided, use this instead of internal state
    ws?: WebSocket | null; // WebSocket connection for real-time updates
    onQueueItemsChange?: (items: QueueItem[]) => void; // Callback when queue changes (deprecated, use ws)
    onVote?: (itemId: string, vote: "up" | "down") => Promise<void> | void; // Backend vote handler (disabled for now)
    onApprove?: (itemId: string) => Promise<void> | void; // Backend approve handler (deprecated, use ws)
    onDelete?: (itemId: string) => Promise<void> | void; // Backend delete handler (deprecated, use ws)
    onReorder?: (itemId: string, direction: "up" | "down") => Promise<void> | void; // Backend reorder handler (deprecated, use ws)
    onAddToQueue?: (item: QueueItem) => Promise<void> | void; // Backend add to queue handler
    onSuggest?: (item: QueueItem) => Promise<void> | void; // Backend suggest handler
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// YouTube API functions
const searchYouTubeAPI = async (query: string) => {
    const response = await fetch(
        `${API_BASE}/api/youtube/search?q=${encodeURIComponent(query)}&max_results=10`
    );
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
};

const downloadVideoAPI = async (videoId: string) => {
    const response = await fetch(`${API_BASE}/api/youtube/download`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            video_id: videoId,
            format: "bestaudio/best",
            extract_audio: true,
        }),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error! status: ${response.status}` }));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }
    return response.json();
};

// const getDownloadUrlAPI = async (videoId: string) => {
//     const response = await fetch(
//         `${API_BASE}/api/youtube/download-url/${videoId}?format=bestaudio/best`
//     );
//     if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`);
//     }
//     return response.json();
// };

export function QueueSearch({ 
    mode, 
    isDrawer = false, 
    onClose, 
    currentTrackId,
    queueItems: externalQueueItems,
    ws,
    onApprove,
    onDelete,
    onReorder,
    onAddToQueue,
    onSuggest,
    onVote,
}: QueueSearchProps) {
    const { roomSettings } = useJukeboxStore();
    const [activeTab, setActiveTab] = useState<"queue" | "search">("queue");
    const [isEditMode, setIsEditMode] = useState(false);
    const [currentTime, setCurrentTime] = useState(Date.now() / 1000); // Current time in seconds
    const [userVotes, setUserVotes] = useState<Map<string, "up" | "down">>(new Map()); // Track user votes locally
    
    // Use prop mode directly (set from backend based on user role)
    const effectiveMode = mode;
    const [searchQuery, setSearchQuery] = useState("");
    
    // Use external queue items from WebSocket/backend - no internal state
    const queueItems = externalQueueItems || [];
    
    // Update current time every second for voting progress
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(Date.now() / 1000);
        }, 1000);
        return () => clearInterval(interval);
    }, []);
    
    // Merge user votes into queue items
    const queueItemsWithVotes = queueItems.map(item => ({
        ...item,
        userVote: userVotes.get(item.id) || null,
    }));
    
    // Debug: Log queue items
    useEffect(() => {
        console.log("QueueSearch received queueItems:", queueItems, "length:", queueItems.length);
    }, [queueItems]);

    const formatDuration = (seconds?: number): string => {
        if (!seconds) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const handleVote = async (itemId: string, vote: "up" | "down") => {
        // Update local vote state immediately for better UX
        const currentVote = userVotes.get(itemId);
        if (currentVote === vote) {
            // Same vote clicked - remove vote (toggle off)
            setUserVotes(prev => {
                const newMap = new Map(prev);
                newMap.delete(itemId);
                return newMap;
            });
        } else {
            // Different vote or new vote
            setUserVotes(prev => {
                const newMap = new Map(prev);
                newMap.set(itemId, vote);
                return newMap;
            });
        }
        
        // Send vote via WebSocket
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: vote === "up" ? "vote_up" : "vote_down",
                payload: { item_id: itemId }
            }));
        } else if (onVote) {
            // Fallback to callback if WebSocket not available
            try {
                await onVote(itemId, vote);
            } catch (error) {
                console.error("Vote failed:", error);
                // Revert local state on error
                setUserVotes(prev => {
                    const newMap = new Map(prev);
                    if (currentVote) {
                        newMap.set(itemId, currentVote);
                    } else {
                        newMap.delete(itemId);
                    }
                    return newMap;
                });
            }
        }
    };

    const handleApprove = async (itemId: string) => {
        // Send approve message via WebSocket
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "approve_item",
                payload: { item_id: itemId }
            }));
        } else if (onApprove) {
            // Fallback to callback if WebSocket not available
            try {
                await onApprove(itemId);
            } catch (error) {
                console.error("Approve failed:", error);
            }
        }
    };

    const handleDelete = async (itemId: string) => {
        // Send delete message via WebSocket
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "delete_item",
                payload: { item_id: itemId }
            }));
        } else if (onDelete) {
            // Fallback to callback if WebSocket not available
            try {
                await onDelete(itemId);
            } catch (error) {
                console.error("Delete failed:", error);
            }
        }
    };

    const handleReorder = async (itemId: string, direction: "up" | "down") => {
        // Send reorder message via WebSocket
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "reorder_item",
                payload: { item_id: itemId, direction }
            }));
        } else if (onReorder) {
            // Fallback to callback if WebSocket not available
            try {
                await onReorder(itemId, direction);
            } catch (error) {
                console.error("Reorder failed:", error);
            }
        }
    };

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-4 border-b">
                <div className="flex items-start justify-between mb-2">
                    <div>
                        <h2 className="text-2xl font-bold">Queue & Search</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Manage your music queue
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
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

                {/* Tabs */}
                <div className="flex items-center justify-between gap-4 mt-4">
                    <div className="flex gap-1">
                        <button
                            onClick={() => setActiveTab("queue")}
                            className={cn(
                                "px-4 py-2 text-sm font-medium transition-colors border-b-2",
                                activeTab === "queue"
                                    ? "border-foreground font-bold"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Queue
                        </button>
                        <button
                            onClick={() => setActiveTab("search")}
                            className={cn(
                                "px-4 py-2 text-sm font-medium transition-colors border-b-2",
                                activeTab === "search"
                                    ? "border-foreground font-bold"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Search
                        </button>
                    </div>
                    <div className="text-sm text-muted-foreground">
                        {queueItems.length} {queueItems.length === 1 ? 'song' : 'songs'}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === "queue" ? (
                    <div className="p-4 space-y-2">
                        {(() => {
                            // Find current track index
                            const currentIndex = queueItemsWithVotes.findIndex(item => item.id === currentTrackId);
                            
                            // Find next track (not suggested and not pending) after current track
                            let nextTrackId: string | null = null;
                            if (currentIndex >= 0) {
                                // Look for next non-suggested, non-pending track after current
                                for (let i = 1; i < queueItemsWithVotes.length; i++) {
                                    const nextIndex = (currentIndex + i) % queueItemsWithVotes.length;
                                    const nextItem = queueItemsWithVotes[nextIndex];
                                    if (!nextItem.isSuggested && !nextItem.isPending) {
                                        nextTrackId = nextItem.id;
                                        break;
                                    }
                                }
                            }
                            
                            // Filter out items without valid IDs (non-empty string)
                            const validQueueItems = queueItemsWithVotes.filter(item => item && item.id && String(item.id).trim() !== "");
                            
                            if (validQueueItems.length === 0 && queueItemsWithVotes.length > 0) {
                                console.warn("QueueSearch: Found items but none have valid IDs:", queueItemsWithVotes);
                                // If no valid items but we have items, show them anyway (might be pending items)
                                return queueItemsWithVotes.map((item, index) => {
                                    // Use index as fallback key if ID is invalid
                                    const itemKey = (item && item.id && String(item.id).trim() !== "") ? item.id : `item-${index}`;
                                    // const isCurrentTrack = currentTrackId === item.id;
                                    // const isNextTrack = item.id === nextTrackId && !item.isSuggested && !item.isPending;
                                    
                                    return (
                                        <div key={itemKey} className="text-sm text-muted-foreground p-2">
                                            Invalid item: {JSON.stringify(item)}
                                        </div>
                                    );
                                });
                            }
                            
                            return queueItemsWithVotes.map((item, index) => {
                                const isCurrentTrack = currentTrackId === item.id;
                                const isNextTrack = item.id === nextTrackId && !item.isSuggested && !item.isPending;
                                // Create unique key by combining ID with index to handle duplicates
                                const uniqueKey = `${item.id}-${index}`;
                            
                            return (
                                <div
                                    key={uniqueKey}
                                    className="flex items-center gap-2"
                                >
                                    {/* Reorder controls (edit mode only) - Outside card, left side */}
                                    {isEditMode && (
                                        <div className="flex flex-col gap-0.5">
                                            <button
                                                onClick={() => handleReorder(item.id, "up")}
                                                className="p-1 hover:bg-muted rounded transition-colors"
                                                disabled={queueItemsWithVotes.indexOf(item) === 0}
                                            >
                                                <ChevronUp className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleReorder(item.id, "down")}
                                                className="p-1 hover:bg-muted rounded transition-colors"
                                                disabled={queueItemsWithVotes.indexOf(item) === queueItemsWithVotes.length - 1}
                                            >
                                                <ChevronDown className="h-4 w-4" />
                                            </button>
                                        </div>
                                    )}

                                    {/* Card - Same for all items */}
                                    <div
                                        onClick={() => {
                                            // Only allow host to change track, and don't allow clicking pending or suggested items
                                            if (effectiveMode === "host" && !item.isPending && !item.isSuggested) {
                                                // Don't do anything if clicking the current track
                                                if (item.id === currentTrackId) {
                                                    return;
                                                }
                                                
                                                // Don't allow clicking items without URL (pending or failed)
                                                if (!item.url) {
                                                    return;
                                                }
                                                
                                                // Send set_track message via WebSocket
                                                if (ws && ws.readyState === WebSocket.OPEN) {
                                                    ws.send(JSON.stringify({
                                                        type: "set_track",
                                                        payload: {
                                                            track: {
                                                                id: item.id,
                                                                title: item.title,
                                                                artist: item.artist,
                                                                url: item.url,
                                                                artwork: item.artwork,
                                                                source: item.source,
                                                                duration: item.duration
                                                            },
                                                            is_playing: true // Request to play the track
                                                        }
                                                    }));
                                                }
                                            }
                                        }}
                                        className={cn(
                                            "flex items-center gap-3 p-3 rounded-lg border flex-1 min-w-0 transition-colors relative",
                                            item.source === "youtube" && "border-red-500",
                                            isCurrentTrack && "bg-primary/10 border-primary",
                                            isNextTrack && "bg-muted/30",
                                            item.isPending && "opacity-50", // Faded appearance for pending items
                                            !isEditMode && !item.isPending && !item.isSuggested && "hover:bg-muted/50",
                                            effectiveMode === "host" && item.id !== currentTrackId && !item.isPending && !item.isSuggested && "cursor-pointer",
                                            effectiveMode === "host" && (item.id === currentTrackId || item.isPending || item.isSuggested) && "cursor-default"
                                        )}
                                    >
                                        {/* Now Playing / Next indicator - Top right */}
                                        {(isCurrentTrack || isNextTrack) && (
                                            <div className={cn(
                                                "absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                                                isCurrentTrack && "bg-primary text-primary-foreground",
                                                isNextTrack && "bg-muted-foreground/20 text-foreground"
                                            )}>
                                                {isCurrentTrack ? (
                                                    <Play className="h-3 w-3" />
                                                ) : (
                                                    <>
                                                        <Music2 className="h-3 w-3" />
                                                        <span>Next</span>
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        {/* Album Art */}
                                        <div className="relative">
                                            <img
                                                src={item.artwork || "https://picsum.photos/id/842/1500/1500"}
                                                alt={`${item.title} artwork`}
                                                className={cn(
                                                    "w-12 h-12 rounded object-cover flex-shrink-0",
                                                    item.isPending && "opacity-50"
                                                )}
                                            />
                                            {item.isPending && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded">
                                                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Song Info */}
                                        <div className="flex-1 min-w-0 overflow-hidden">
                                            <div 
                                                className="font-semibold truncate" 
                                                title={item.title}
                                            >
                                                {item.title}
                                            </div>
                                            <div 
                                                className="text-sm text-muted-foreground truncate"
                                                title={item.artist}
                                            >
                                                {item.artist}
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                {formatDuration(item.duration)}
                                            </div>
                                            {/* Voting progress bar (non-invasive, only for suggested items with duration) */}
                                            {item.isSuggested && item.voting_end_time && (
                                                <div className="mt-1 h-0.5 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-primary transition-all duration-300"
                                                        style={{
                                                            width: `${Math.max(0, Math.min(100, ((item.voting_end_time - currentTime) / (roomSettings?.voting_duration || 10)) * 100))}%`
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            {/* Show indicator for infinite duration items */}
                                            {item.isSuggested && !item.voting_end_time && (
                                                <div className="mt-1 text-xs text-muted-foreground italic">
                                                    Manual approval required
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                {/* Voting controls (suggested songs, not in edit mode) - Outside card, right side */}
                                {item.isSuggested && !isEditMode && (
                                    <div className="flex flex-col items-center gap-1">
                                        <button
                                            onClick={() => handleVote(item.id, "up")}
                                            disabled={item.voting_end_time ? currentTime >= item.voting_end_time : false}
                                            className={cn(
                                                "p-1 rounded hover:bg-muted transition-colors",
                                                item.userVote === "up" && "bg-primary/20",
                                                (item.voting_end_time && currentTime >= item.voting_end_time) && "opacity-50 cursor-not-allowed"
                                            )}
                                            title={(item.voting_end_time && currentTime >= item.voting_end_time) ? "Voting has ended" : "Vote up"}
                                        >
                                            <ChevronUp className="h-4 w-4" />
                                        </button>
                                        <span className="text-sm font-medium min-w-[2rem] text-center">
                                            {item.votes ?? 0}
                                        </span>
                                        <button
                                            onClick={() => handleVote(item.id, "down")}
                                            disabled={item.voting_end_time ? currentTime >= item.voting_end_time : false}
                                            className={cn(
                                                "p-1 rounded hover:bg-muted transition-colors",
                                                item.userVote === "down" && "bg-primary/20",
                                                (item.voting_end_time && currentTime >= item.voting_end_time) && "opacity-50 cursor-not-allowed"
                                            )}
                                            title={(item.voting_end_time && currentTime >= item.voting_end_time) ? "Voting has ended" : "Vote down"}
                                        >
                                            <ChevronDown className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}

                                {/* Edit mode actions (host only) - Outside card, right side */}
                                {isEditMode && effectiveMode === "host" && (
                                    <div className="flex flex-col gap-1">
                                        {item.isSuggested && (
                                            <button
                                                onClick={() => handleApprove(item.id)}
                                                className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-950 rounded transition-colors"
                                                title="Approve song"
                                            >
                                                <Check className="h-4 w-4" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(item.id)}
                                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded transition-colors"
                                            title="Delete song"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                            );
                        });
                        })()}
                    </div>
                ) : (
                    <div className="p-4">
                        <SearchTab 
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            mode={effectiveMode}
                            ws={ws}
                            setActiveTab={setActiveTab}
                            onAddToQueue={onAddToQueue}
                            onSuggest={onSuggest}
                        />
                    </div>
                )}
            </div>

            {/* Footer Button */}
            <div className="p-4 border-t">
                {activeTab === "queue" && (
                    <Button
                        onClick={() => setIsEditMode(!isEditMode)}
                        className="w-full"
                        variant={isEditMode ? "default" : "outline"}
                        disabled={effectiveMode !== "host"}
                    >
                        {isEditMode ? "Done Editing" : "Edit Queue"}
                    </Button>
                )}
            </div>
        </div>
    );
}

// Search Tab Component
function SearchTab({
    searchQuery,
    setSearchQuery,
    mode,
    ws,
    setActiveTab,
    onAddToQueue,
    onSuggest,
}: {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    mode: "host" | "listener";
    ws?: WebSocket | null;
    setActiveTab: (tab: "queue" | "search") => void;
    onAddToQueue?: (item: QueueItem) => Promise<void> | void;
    onSuggest?: (item: QueueItem) => Promise<void> | void;
}) {
    const { roomSettings } = useJukeboxStore();
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [isHTML5Mode, setIsHTML5Mode] = useState(false);
    const [html5Url, setHtml5Url] = useState("");
    const [html5Title, setHtml5Title] = useState("");
    const [html5Artist, setHtml5Artist] = useState("");
    const [html5Duration, setHtml5Duration] = useState<number | null>(null);
    const [isLoadingDuration, setIsLoadingDuration] = useState(false);
    const [isUrlValid, setIsUrlValid] = useState<boolean | null>(null);
    
    const { data: searchResults = [], isLoading: isSearching, error: searchError, refetch: refetchSearch } = useQuery({
        queryKey: ["youtube-search", searchQuery],
        queryFn: () => searchYouTubeAPI(searchQuery),
        enabled: false, // Manual trigger
        retry: 1,
    });
    

    const downloadMutation = useMutation({
        mutationFn: downloadVideoAPI,
    });

    const handleSearch = () => {
        if (!searchQuery.trim()) return;
        // TODO: When backend is ready, pass selectedSources as query parameters
        // Example: const sources = Array.from(selectedSources).join(',');
        // Then include in API call: searchAPI(searchQuery, { sources })
        refetchSearch();
    };

    // Validate URL format
    const isValidUrl = (url: string): boolean => {
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
        } catch {
            return false;
        }
    };

    // Fetch duration for HTML5 URL
    const fetchHTML5Duration = async (url: string) => {
        if (!url.trim()) {
            setHtml5Duration(null);
            setIsUrlValid(null);
            return;
        }

        // First check if URL format is valid
        const urlFormatValid = isValidUrl(url);
        if (!urlFormatValid) {
            setHtml5Duration(null);
            setIsUrlValid(false);
            setIsLoadingDuration(false);
            return;
        }

        setIsLoadingDuration(true);
        setIsUrlValid(null); // Reset validity while checking
        try {
            const audio = new Audio(url);
            
            return new Promise<void>((resolve) => {
                const timeout = setTimeout(() => {
                    setHtml5Duration(null);
                    setIsUrlValid(false);
                    setIsLoadingDuration(false);
                    resolve();
                }, 5000);

                const onLoadedMetadata = () => {
                    clearTimeout(timeout);
                    const duration = audio.duration;
                    if (isFinite(duration) && duration > 0) {
                        setHtml5Duration(Math.floor(duration));
                        setIsUrlValid(true);
                    } else {
                        setHtml5Duration(null);
                        setIsUrlValid(false);
                    }
                    setIsLoadingDuration(false);
                    audio.removeEventListener('loadedmetadata', onLoadedMetadata);
                    audio.removeEventListener('error', onError);
                    resolve();
                };

                const onError = () => {
                    clearTimeout(timeout);
                    setHtml5Duration(null);
                    setIsUrlValid(false);
                    setIsLoadingDuration(false);
                    audio.removeEventListener('loadedmetadata', onLoadedMetadata);
                    audio.removeEventListener('error', onError);
                    resolve();
                };

                audio.addEventListener('loadedmetadata', onLoadedMetadata);
                audio.addEventListener('error', onError);
            });
        } catch {
            setHtml5Duration(null);
            setIsUrlValid(false);
            setIsLoadingDuration(false);
        }
    };

    // Debounce duration fetch when URL changes
    const durationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (durationTimeoutRef.current) {
            clearTimeout(durationTimeoutRef.current);
        }

        if (!html5Url.trim()) {
            setHtml5Duration(null);
            setIsUrlValid(null);
            setIsLoadingDuration(false);
            return;
        }

        durationTimeoutRef.current = setTimeout(() => {
            fetchHTML5Duration(html5Url);
        }, 500);

        return () => {
            if (durationTimeoutRef.current) {
                clearTimeout(durationTimeoutRef.current);
            }
        };
    }, [html5Url]);


    const handleDownloadAndAdd = async (result: any) => {
        try {
            // Create pending queue item
            const queueItem: QueueItem = {
                id: result.id,
                title: result.title,
                artist: result.channel || "Unknown Artist",
                url: "", // Will be set when download completes
                source: "html5",
                duration: result.duration,
                artwork: result.thumbnail,
                isPending: true,
                video_id: result.id, // Store video ID for download
            };

            // Send via WebSocket to backend - adds to queue as pending, then starts download
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "add_pending_download",
                    payload: { item: queueItem }
                }));
                
                // Switch to queue tab automatically
                setActiveTab("queue");
            } else if (onAddToQueue) {
                // Fallback to callback if WebSocket not available
                await onAddToQueue(queueItem);
                setActiveTab("queue");
            }
        } catch (error) {
            console.error("Download and add failed:", error);
        }
    };

    const handleAddDirect = async (result: any) => {
        console.log("handleAddDirect called:", result, "ws:", ws, "ws.readyState:", ws?.readyState, "mode:", mode);
        try {
            // For YouTube source, use the YouTube watch URL (not the streaming URL)
            // The YouTube adapter will extract the video ID from this URL
            const youtubeWatchUrl = `https://www.youtube.com/watch?v=${result.id}`;
            
            // Duration is 1 second less than original
            const duration = result.duration ? Math.max(1, result.duration - 1) : undefined;
            
            const queueItem: QueueItem = {
                id: result.id,
                title: result.title,
                artist: result.channel || "Unknown Artist",
                url: youtubeWatchUrl, // Use YouTube watch URL for YouTube adapter
                source: "youtube", // Direct YouTube stream
                duration: duration,
                artwork: result.thumbnail,
            };

            console.log("handleAddDirect: QueueItem created:", queueItem);

            // Send via WebSocket to backend
            if (ws && ws.readyState === WebSocket.OPEN) {
                console.log("handleAddDirect: Sending add_to_queue via WebSocket");
                ws.send(JSON.stringify({
                    type: "add_to_queue",
                    payload: { item: queueItem }
                }));
                
                // Switch to queue tab automatically
                setActiveTab("queue");
            } else {
                console.warn("handleAddDirect: WebSocket not available or not open. ws:", ws, "readyState:", ws?.readyState);
                if (onAddToQueue) {
                    // Fallback to callback if WebSocket not available
                    console.log("handleAddDirect: Using onAddToQueue callback");
                    await onAddToQueue(queueItem);
                    setActiveTab("queue");
                }
            }
        } catch (error) {
            console.error("Add direct failed:", error);
        }
    };

    const handleSuggestYouTube = async (result: any) => {
        try {
            // For YouTube source, use the YouTube watch URL (not the streaming URL)
            // The YouTube adapter will extract the video ID from this URL
            const youtubeWatchUrl = `https://www.youtube.com/watch?v=${result.id}`;
            
            // Duration is 1 second less than original
            const duration = result.duration ? Math.max(1, result.duration - 1) : undefined;

            // Send via WebSocket if available
            if (ws && ws.readyState === WebSocket.OPEN) {
                console.log("handleSuggestYouTube: Sending suggest_item via WebSocket");
                ws.send(JSON.stringify({
                    type: "suggest_item",
                    payload: {
                        item: {
                            id: result.id,
                            title: result.title,
                            artist: result.channel || "Unknown Artist",
                            url: youtubeWatchUrl, // Use YouTube watch URL for YouTube adapter
                            source: "youtube",
                            duration: duration,
                            artwork: result.thumbnail,
                            video_id: result.id,
                        }
                    }
                }));
                // Switch to queue tab automatically
                setActiveTab("queue");
            } else {
                console.warn("handleSuggestYouTube: WebSocket not available or not open. ws:", ws, "readyState:", ws?.readyState);
                if (onSuggest) {
                    // Fallback to callback
                    const queueItem: QueueItem = {
                        id: result.id,
                        title: result.title,
                        artist: result.channel || "Unknown Artist",
                        url: youtubeWatchUrl,
                        source: "youtube",
                        duration: duration,
                        artwork: result.thumbnail,
                        isSuggested: true,
                        votes: 0,
                        userVote: null,
                    };
                    await onSuggest(queueItem);
                }
            }
        } catch (error) {
            console.error("Suggest YouTube failed:", error);
        }
    };

    const handleSuggestHTML5 = async (result: any) => {
        try {
            console.log("handleSuggestHTML5: Sending suggest_item immediately (download will happen in background)");

            // Duration is 1.25 seconds less than original
            const duration = result.duration ? Math.max(1, result.duration - 1.25) : undefined;

            // Send via WebSocket immediately (download happens in background on backend)
            if (ws && ws.readyState === WebSocket.OPEN) {
                console.log("handleSuggestHTML5: Sending suggest_item via WebSocket");
                ws.send(JSON.stringify({
                    type: "suggest_item",
                    payload: {
                        item: {
                            id: result.id,
                            title: result.title,
                            artist: result.channel || "Unknown Artist",
                            url: "", // Empty URL - will be set when download completes
                            source: "html5",
                            duration: duration,
                            artwork: result.thumbnail,
                            video_id: result.id, // For background download
                        }
                    }
                }));
                // Switch to queue tab automatically
                setActiveTab("queue");
            } else {
                console.warn("handleSuggestHTML5: WebSocket not available or not open. ws:", ws, "readyState:", ws?.readyState);
                if (onSuggest) {
                    // Fallback to callback
                    const queueItem: QueueItem = {
                        id: result.id,
                        title: result.title,
                        artist: result.channel || "Unknown Artist",
                        url: "",
                        source: "html5",
                        duration: duration,
                        artwork: result.thumbnail,
                        isSuggested: true,
                        votes: 0,
                        userVote: null,
                        isPending: true,
                    };
                    await onSuggest(queueItem);
                }
            }
        } catch (error) {
            console.error("Suggest HTML5 failed:", error);
        }
    };

    const handleAddHTML5Direct = async () => {
        console.log("handleAddHTML5Direct called:", "ws:", ws, "ws.readyState:", ws?.readyState, "mode:", mode, "html5Url:", html5Url, "isUrlValid:", isUrlValid);
        if (!html5Url.trim() || !isUrlValid) {
            console.warn("handleAddHTML5Direct: URL invalid or empty, returning");
            return;
        }
        
        // Duration is 1.25 seconds less than original
        const duration = html5Duration ? Math.max(1, html5Duration - 1.25) : undefined;
        
        const queueItem: QueueItem = {
            id: `html5-${Date.now()}`,
            title: html5Title.trim() || "Unknown Title",
            artist: html5Artist.trim() || "Unknown Artist",
            url: html5Url.trim(),
            source: "html5",
            duration: duration,
            artwork: "https://placehold.co/800?text=HTML5",
        };

        console.log("handleAddHTML5Direct: QueueItem created:", queueItem);

        // Send via WebSocket to backend
        if (ws && ws.readyState === WebSocket.OPEN) {
            console.log("handleAddHTML5Direct: Sending add_to_queue via WebSocket");
            ws.send(JSON.stringify({
                type: "add_to_queue",
                payload: { item: queueItem }
            }));
            
            // Switch to queue tab automatically
            setActiveTab("queue");
            
            // Clear form
            setHtml5Url("");
            setHtml5Title("");
            setHtml5Artist("");
            setHtml5Duration(null);
        } else {
            console.warn("handleAddHTML5Direct: WebSocket not available or not open. ws:", ws, "readyState:", ws?.readyState);
            if (onAddToQueue) {
                // Fallback to callback if WebSocket not available
                console.log("handleAddHTML5Direct: Using onAddToQueue callback");
                await onAddToQueue(queueItem);
                setActiveTab("queue");
                
                // Clear form
                setHtml5Url("");
                setHtml5Title("");
                setHtml5Artist("");
                setHtml5Duration(null);
            }
        }
    };

    const handleSuggestHTML5Direct = async () => {
        if (!html5Url.trim()) return;
        
        console.log("handleSuggestHTML5Direct: Sending HTML5 direct suggestion");

        // Duration is 1.25 seconds less than original
        const duration = html5Duration ? Math.max(1, html5Duration - 1.25) : undefined;

        // Send via WebSocket if available
        if (ws && ws.readyState === WebSocket.OPEN) {
            console.log("handleSuggestHTML5Direct: Sending suggest_item via WebSocket");
            ws.send(JSON.stringify({
                type: "suggest_item",
                payload: {
                    item: {
                        id: `html5-${Date.now()}`,
                        title: html5Title.trim() || "Unknown Title",
                        artist: html5Artist.trim() || "Unknown Artist",
                        url: html5Url.trim(),
                        source: "html5",
                        duration: duration,
                        artwork: undefined,
                    }
                }
            }));
            // Switch to queue tab automatically
            setActiveTab("queue");
            // Clear form
            setHtml5Url("");
            setHtml5Title("");
            setHtml5Artist("");
        } else {
            console.warn("handleSuggestHTML5Direct: WebSocket not available or not open. ws:", ws, "readyState:", ws?.readyState);
            if (onSuggest) {
                // Fallback to callback
                const queueItem: QueueItem = {
                    id: `html5-${Date.now()}`,
                    title: html5Title.trim() || "Unknown Title",
                    artist: html5Artist.trim() || "Unknown Artist",
                    url: html5Url.trim(),
                    source: "html5",
                    duration: duration,
                    artwork: undefined,
                    isSuggested: true,
                    votes: 0,
                    userVote: null,
                };
                await onSuggest(queueItem);
                // Clear form
                setHtml5Url("");
                setHtml5Title("");
                setHtml5Artist("");
            }
        }
    };

    const formatDuration = (seconds?: number): string => {
        if (!seconds) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    return (
        <div className="space-y-4 min-w-0">
            {/* HTML5 toggle - only toggle remaining */}
            <div className="flex justify-end items-center">
                <button
                    onClick={() => setIsHTML5Mode(!isHTML5Mode)}
                    className={cn(
                        "p-1.5 rounded border transition-colors",
                        isHTML5Mode
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-muted"
                    )}
                    title="HTML5"
                >
                    <FileAudio className="h-4 w-4" />
                </button>
            </div>
            
            {/* HTML5 Mode: Manual input form */}
            {isHTML5Mode ? (
                <div className="space-y-3">
                    <div>
                        <Input
                            type="text"
                            placeholder="HTML5 Source URL"
                            value={html5Url}
                            onChange={(e) => setHtml5Url(e.target.value)}
                            className="w-full"
                        />
                        {isLoadingDuration && (
                            <p className="text-xs text-muted-foreground mt-1">Loading duration...</p>
                        )}
                        {html5Duration !== null && !isLoadingDuration && isUrlValid && (
                            <p className="text-xs text-muted-foreground mt-1">
                                Duration: {formatDuration(html5Duration)}
                            </p>
                        )}
                        {isUrlValid === false && !isLoadingDuration && (
                            <p className="text-xs text-destructive mt-1">Invalid URL</p>
                        )}
                    </div>
                    <Input
                        type="text"
                        placeholder="Track Name"
                        value={html5Title}
                        onChange={(e) => setHtml5Title(e.target.value)}
                        className="w-full"
                    />
                    <Input
                        type="text"
                        placeholder="Track Artist"
                        value={html5Artist}
                        onChange={(e) => setHtml5Artist(e.target.value)}
                        className="w-full"
                    />
                    <div className="flex flex-col gap-2">
                        {mode === "host" && (
                            <Button
                                onClick={handleAddHTML5Direct}
                                disabled={!html5Url.trim() || !isUrlValid}
                                className="w-full"
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                Add to Queue
                            </Button>
                        )}
                        <Button
                            onClick={handleSuggestHTML5Direct}
                            disabled={
                                !html5Url.trim() || 
                                !isUrlValid || 
                                !!(roomSettings && !roomSettings.voting_enabled && mode === "listener")
                            }
                            variant="outline"
                            className="w-full"
                            title={
                                roomSettings && !roomSettings.voting_enabled && mode === "listener"
                                    ? "Voting is disabled"
                                    : "Suggest for voting"
                            }
                        >
                            <Vote className="h-4 w-4 mr-2" />
                            Open for Vote
                        </Button>
                    </div>
                </div>
            ) : (
                /* Search input and button - normal mode */
                <>
                    <div className="flex gap-2">
                        <Input
                            type="text"
                            placeholder="Search for songs..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                            className="flex-1"
                        />
                        <Button onClick={handleSearch} disabled={isSearching}>
                            {isSearching ? "Searching..." : "Search"}
                        </Button>
                    </div>
                    
                    {/* Search Results - only show when not in HTML5 mode */}
                    {searchError && (
                        <div className="p-2 bg-red-100 text-red-700 rounded text-sm">
                            Error: {(searchError as Error).message}
                        </div>
                    )}

                    {searchResults.length > 0 && (
                        <div className="space-y-2">
                            {searchResults.map((result: any, index: number) => (
                                <div
                                    key={`${result.id}-${index}`}
                                    className="flex items-center gap-2 min-w-0 w-full"
                                >
                                    {/* Card - Same design as queue */}
                                    <div className="flex items-center gap-3 p-3 rounded-lg border flex-1 min-w-0 transition-colors hover:bg-muted/50">
                                        {result.thumbnail && (
                                            <img
                                                src={result.thumbnail}
                                                alt={result.title}
                                                className="w-12 h-12 rounded object-cover flex-shrink-0"
                                            />
                                        )}
                                        <div className="flex-1 min-w-0 overflow-hidden">
                                            <div 
                                                className="font-semibold truncate" 
                                                title={result.title}
                                            >
                                                {result.title}
                                            </div>
                                            <div 
                                                className="text-sm text-muted-foreground truncate"
                                                title={result.channel}
                                            >
                                                {result.channel}
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                {formatDuration(result.duration)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Buttons outside card */}
                                    <div className="flex flex-col gap-1 flex-shrink-0 relative">
                                        {/* Host-only: Add button with dropdown */}
                                        {mode === "host" && (
                                            <div className="relative">
                                                <Button
                                                    size="icon"
                                                    variant="outline"
                                                    className="h-8 w-8"
                                                    onClick={() => setOpenMenuId(openMenuId === result.id ? null : result.id)}
                                                >
                                                    <Plus className="h-4 w-4" />
                                                </Button>
                                                
                                                {/* Dropdown menu */}
                                                {openMenuId === result.id && (
                                                    <>
                                                        <div 
                                                            className="fixed inset-0 z-10" 
                                                            onClick={() => setOpenMenuId(null)}
                                                        />
                                                        <div className="absolute right-0 top-10 z-20 bg-background border rounded-lg shadow-lg min-w-[120px]">
                                                            <button
                                                                onClick={() => {
                                                                    handleAddDirect(result);
                                                                    setOpenMenuId(null);
                                                                }}
                                                                className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 rounded-t-lg"
                                                            >
                                                                <Youtube className="h-4 w-4" />
                                                                YouTube
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    handleDownloadAndAdd(result);
                                                                    setOpenMenuId(null);
                                                                }}
                                                                disabled={downloadMutation.isPending}
                                                                className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 rounded-b-lg disabled:opacity-50"
                                                            >
                                                            <FileAudio className="h-4 w-4" />
                                                            HTML5
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        
                                        {/* Open for Vote button with dropdown */}
                                        <div className="relative">
                                            <Button
                                                size="icon"
                                                variant="outline"
                                                className="h-8 w-8"
                                                onClick={() => setOpenMenuId(openMenuId === `vote-${result.id}` ? null : `vote-${result.id}`)}
                                                disabled={!!(roomSettings && !roomSettings.voting_enabled && mode === "listener")}
                                                title={
                                                    roomSettings && !roomSettings.voting_enabled && mode === "listener"
                                                        ? "Voting is disabled"
                                                        : "Suggest for voting"
                                                }
                                            >
                                                <Vote className="h-4 w-4" />
                                            </Button>
                                            
                                            {/* Dropdown menu */}
                                            {openMenuId === `vote-${result.id}` && (
                                                <>
                                                    <div 
                                                        className="fixed inset-0 z-10" 
                                                        onClick={() => setOpenMenuId(null)}
                                                    />
                                                    <div className="absolute right-0 top-10 z-20 bg-background border rounded-lg shadow-lg min-w-[120px]">
                                                        <button
                                                            onClick={() => {
                                                                handleSuggestYouTube(result);
                                                                setOpenMenuId(null);
                                                            }}
                                                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 rounded-t-lg"
                                                        >
                                                            <Youtube className="h-4 w-4" />
                                                            YouTube
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                handleSuggestHTML5(result);
                                                                setOpenMenuId(null);
                                                            }}
                                                            disabled={downloadMutation.isPending}
                                                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 rounded-b-lg disabled:opacity-50"
                                                        >
                                                            <FileAudio className="h-4 w-4" />
                                                            HTML5
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

