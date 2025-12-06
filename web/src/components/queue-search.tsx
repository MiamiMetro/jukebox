import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import type { Track } from "@/types/audio-player";
import { ChevronUp, ChevronDown, Trash2, Check, X, Music2, Play, Plus, Vote, CloudUpload, Youtube, Music } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";

// Extended track type for queue items with voting
export interface QueueItem extends Track {
    isSuggested?: boolean;
    votes?: number;
    userVote?: "up" | "down" | null;
    isNext?: boolean; // Manual flag for "Next" indicator
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
    onModeChange?: (mode: "host" | "listener") => void; // Callback when mode changes (for debug toggle)
}

const API_BASE = "http://192.168.1.2:8000";

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

const getDownloadUrlAPI = async (videoId: string) => {
    const response = await fetch(
        `${API_BASE}/api/youtube/download-url/${videoId}?format=bestaudio/best`
    );
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
};

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
    onModeChange,
}: QueueSearchProps) {
    const [activeTab, setActiveTab] = useState<"queue" | "search">("queue");
    const [isEditMode, setIsEditMode] = useState(false);
    const [debugMode, setDebugMode] = useState<"host" | "listener">(mode);
    
    // Use debug mode if onModeChange is provided, otherwise use prop mode
    const effectiveMode = onModeChange ? debugMode : mode;
    const [searchQuery, setSearchQuery] = useState("");
    
    // Use external queue items from WebSocket/backend - no internal state
    const queueItems = externalQueueItems || [];

    const formatDuration = (seconds?: number): string => {
        if (!seconds) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const handleVote = async (_itemId: string, _vote: "up" | "down") => {
        // Vote functionality disabled for now - buttons will be non-functional
        // This will be implemented later
        console.log("Vote functionality disabled");
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
                        {/* Debug Mode Toggle */}
                        {onModeChange && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    const newMode = debugMode === "host" ? "listener" : "host";
                                    setDebugMode(newMode);
                                    onModeChange(newMode);
                                }}
                                className="text-xs"
                            >
                                {effectiveMode === "host" ? "Host" : "Listener"}
                            </Button>
                        )}
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
                            const currentIndex = queueItems.findIndex(item => item.id === currentTrackId);
                            
                            // Find next track (not suggested) after current track
                            let nextTrackId: string | null = null;
                            if (currentIndex >= 0) {
                                // Look for next non-suggested track after current
                                for (let i = 1; i < queueItems.length; i++) {
                                    const nextIndex = (currentIndex + i) % queueItems.length;
                                    const nextItem = queueItems[nextIndex];
                                    if (!nextItem.isSuggested) {
                                        nextTrackId = nextItem.id;
                                        break;
                                    }
                                }
                            }
                            
                            return queueItems.map((item) => {
                                const isCurrentTrack = currentTrackId === item.id;
                                const isNextTrack = item.id === nextTrackId && !item.isSuggested;
                            
                            return (
                                <div
                                    key={item.id}
                                    className="flex items-center gap-2"
                                >
                                    {/* Reorder controls (edit mode only) - Outside card, left side */}
                                    {isEditMode && (
                                        <div className="flex flex-col gap-0.5">
                                            <button
                                                onClick={() => handleReorder(item.id, "up")}
                                                className="p-1 hover:bg-muted rounded transition-colors"
                                                disabled={queueItems.indexOf(item) === 0}
                                            >
                                                <ChevronUp className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleReorder(item.id, "down")}
                                                className="p-1 hover:bg-muted rounded transition-colors"
                                                disabled={queueItems.indexOf(item) === queueItems.length - 1}
                                            >
                                                <ChevronDown className="h-4 w-4" />
                                            </button>
                                        </div>
                                    )}

                                    {/* Card - Same for all items */}
                                    <div
                                        onClick={() => {
                                            // Only allow host to change track
                                            if (effectiveMode === "host") {
                                                // Don't do anything if clicking the current track
                                                if (item.id === currentTrackId) {
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
                                                            }
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
                                            !isEditMode && "hover:bg-muted/50",
                                            effectiveMode === "host" && item.id !== currentTrackId && "cursor-pointer",
                                            effectiveMode === "host" && item.id === currentTrackId && "cursor-default"
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
                                        <img
                                            src={item.artwork || "https://picsum.photos/id/842/1500/1500"}
                                            alt={`${item.title} artwork`}
                                            className="w-12 h-12 rounded object-cover flex-shrink-0"
                                        />

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
                                        </div>
                                    </div>

                                {/* Voting controls (suggested songs, not in edit mode) - Outside card, right side */}
                                {item.isSuggested && !isEditMode && (
                                    <div className="flex flex-col items-center gap-1">
                                        <button
                                            onClick={() => handleVote(item.id, "up")}
                                            disabled={true}
                                            className={cn(
                                                "p-1 rounded hover:bg-muted transition-colors opacity-50 cursor-not-allowed",
                                                item.userVote === "up" && "bg-primary/20"
                                            )}
                                            title="Voting disabled for now"
                                        >
                                            <ChevronUp className="h-4 w-4" />
                                        </button>
                                        <span className="text-sm font-medium min-w-[2rem] text-center">
                                            {item.votes ?? 0}
                                        </span>
                                        <button
                                            onClick={() => handleVote(item.id, "down")}
                                            disabled={true}
                                            className={cn(
                                                "p-1 rounded hover:bg-muted transition-colors opacity-50 cursor-not-allowed",
                                                item.userVote === "down" && "bg-primary/20"
                                            )}
                                            title="Voting disabled for now"
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
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [selectedSources, setSelectedSources] = useState<Set<"youtube" | "spotify" | "soundcloud">>(new Set(["youtube", "spotify", "soundcloud"]));
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
    
    const toggleSource = (source: "youtube" | "spotify" | "soundcloud") => {
        setSelectedSources(prev => {
            const newSet = new Set(prev);
            if (newSet.has(source)) {
                // Allow deselecting any source
                newSet.delete(source);
            } else {
                // Add the source
                newSet.add(source);
            }
            return newSet;
        });
    };

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
        } catch (error) {
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
            const downloadResult = await downloadMutation.mutateAsync(result.id);
            
            const queueItem: QueueItem = {
                id: result.id,
                title: downloadResult.title || result.title,
                artist: result.channel || "Unknown Artist",
                url: downloadResult.url,
                source: "html5", // Downloaded as HTML5
                duration: downloadResult.duration || result.duration,
                artwork: result.thumbnail,
            };

            if (onAddToQueue) {
                await onAddToQueue(queueItem);
            }
        } catch (error) {
            console.error("Download and add failed:", error);
        }
    };

    const handleAddDirect = async (result: any) => {
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

            // Send via WebSocket to backend
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "add_to_queue",
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
            console.error("Add direct failed:", error);
        }
    };

    const handleSuggestYouTube = async (result: any) => {
        try {
            const urlData = await getDownloadUrlAPI(result.id);
            
            const queueItem: QueueItem = {
                id: result.id,
                title: result.title,
                artist: result.channel || "Unknown Artist",
                url: urlData.url,
                source: "youtube",
                duration: result.duration,
                artwork: result.thumbnail,
                isSuggested: true,
                votes: 0,
                userVote: null,
            };

            if (onSuggest) {
                await onSuggest(queueItem);
            }
        } catch (error) {
            console.error("Suggest YouTube failed:", error);
        }
    };

    const handleSuggestHTML5 = async (result: any) => {
        try {
            const downloadResult = await downloadMutation.mutateAsync(result.id);
            
            const queueItem: QueueItem = {
                id: result.id,
                title: downloadResult.title || result.title,
                artist: result.channel || "Unknown Artist",
                url: downloadResult.url,
                source: "html5",
                duration: downloadResult.duration || result.duration,
                artwork: result.thumbnail,
                isSuggested: true,
                votes: 0,
                userVote: null,
            };

            if (onSuggest) {
                await onSuggest(queueItem);
            }
        } catch (error) {
            console.error("Suggest HTML5 failed:", error);
        }
    };

    const handleAddHTML5Direct = async () => {
        if (!html5Url.trim() || !isUrlValid) return;
        
        const queueItem: QueueItem = {
            id: `html5-${Date.now()}`,
            title: html5Title.trim() || "Unknown Title",
            artist: html5Artist.trim() || "Unknown Artist",
            url: html5Url.trim(),
            source: "html5",
            duration: html5Duration || undefined,
            artwork: "https://placehold.co/800?text=HTML5",
        };

        // Send via WebSocket to backend
        if (ws && ws.readyState === WebSocket.OPEN) {
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
        } else if (onAddToQueue) {
            // Fallback to callback if WebSocket not available
            await onAddToQueue(queueItem);
            setActiveTab("queue");
            
            // Clear form
            setHtml5Url("");
            setHtml5Title("");
            setHtml5Artist("");
            setHtml5Duration(null);
        }
    };

    const handleSuggestHTML5Direct = async () => {
        if (!html5Url.trim()) return;
        
        const queueItem: QueueItem = {
            id: `html5-${Date.now()}`,
            title: html5Title.trim() || "Unknown Title",
            artist: html5Artist.trim() || "Unknown Artist",
            url: html5Url.trim(),
            source: "html5",
            artwork: undefined,
            isSuggested: true,
            votes: 0,
            userVote: null,
        };

        if (onSuggest) {
            await onSuggest(queueItem);
            // Clear form
            setHtml5Url("");
            setHtml5Title("");
            setHtml5Artist("");
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
            {/* Toggle buttons - HTML5 with spacing, then others */}
            <div className="flex justify-end items-center gap-3">
                {/* HTML5 toggle - separated with more space */}
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
                    <CloudUpload className="h-4 w-4" />
                </button>
                
                {/* Source toggles */}
                <div className="flex gap-1">
                    <button
                        onClick={() => toggleSource("youtube")}
                        disabled={isHTML5Mode}
                        className={cn(
                            "p-1.5 rounded border transition-colors",
                            selectedSources.has("youtube")
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border hover:bg-muted",
                            isHTML5Mode && "opacity-50 cursor-not-allowed"
                        )}
                        title="YouTube"
                    >
                        <Youtube className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => toggleSource("spotify")}
                        disabled={isHTML5Mode}
                        className={cn(
                            "p-1.5 rounded border transition-colors",
                            selectedSources.has("spotify")
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border hover:bg-muted",
                            isHTML5Mode && "opacity-50 cursor-not-allowed"
                        )}
                        title="Spotify"
                    >
                        <Music className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => toggleSource("soundcloud")}
                        disabled={isHTML5Mode}
                        className={cn(
                            "p-1.5 rounded border transition-colors",
                            selectedSources.has("soundcloud")
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border hover:bg-muted",
                            isHTML5Mode && "opacity-50 cursor-not-allowed"
                        )}
                        title="SoundCloud"
                    >
                        <Music className="h-4 w-4" />
                    </button>
                </div>
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
                            disabled={true}
                            variant="outline"
                            className="w-full opacity-50 cursor-not-allowed"
                            title="Voting disabled for now"
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
                            {searchResults.map((result: any) => (
                                <div
                                    key={result.id}
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
                                                                <CloudUpload className="h-4 w-4" />
                                                                HTML5
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        
                                        {/* Open for Vote button with dropdown - Disabled for now */}
                                        <div className="relative">
                                            <Button
                                                size="icon"
                                                variant="outline"
                                                className="h-8 w-8 opacity-50 cursor-not-allowed"
                                                disabled={true}
                                                onClick={() => {}} // Disabled - no action
                                                title="Voting disabled for now"
                                            >
                                                <Vote className="h-4 w-4" />
                                            </Button>
                                            
                                            {/* Dropdown menu - kept for future implementation */}
                                            {false && openMenuId === `vote-${result.id}` && (
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
                                                            <CloudUpload className="h-4 w-4" />
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

