import { useState } from "react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import type { Track } from "@/types/audio-player";
import { ChevronUp, ChevronDown, Trash2, Check, X, Music2, Play } from "lucide-react";

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
    onQueueItemsChange?: (items: QueueItem[]) => void; // Callback when queue changes
    onVote?: (itemId: string, vote: "up" | "down") => Promise<void> | void; // Backend vote handler
    onApprove?: (itemId: string) => Promise<void> | void; // Backend approve handler
    onDelete?: (itemId: string) => Promise<void> | void; // Backend delete handler
    onReorder?: (itemId: string, direction: "up" | "down") => Promise<void> | void; // Backend reorder handler
}

export function QueueSearch({ 
    mode, 
    isDrawer = false, 
    onClose, 
    currentTrackId,
    queueItems: externalQueueItems,
    onQueueItemsChange,
    onVote,
    onApprove,
    onDelete,
    onReorder,
}: QueueSearchProps) {
    const [activeTab, setActiveTab] = useState<"queue" | "search">("queue");
    const [isEditMode, setIsEditMode] = useState(false);
    
    // Use external queue items if provided, otherwise use mock data
    const [internalQueueItems, setInternalQueueItems] = useState<QueueItem[]>([
        {
            id: "1",
            title: "Sample Song 1",
            artist: "Artist 1",
            url: "https://example.com/song1.mp3",
            source: "html5",
            duration: 255,
            artwork: "https://picsum.photos/id/842/1500/1500",
            isSuggested: false,
            isNext: true, // Debug: Mark as next
        },
        {
            id: "2",
            title: "Sample Song 2",
            artist: "Artist 2",
            url: "https://example.com/song2.mp3",
            source: "youtube", // This will have red border
            duration: 264,
            artwork: "https://picsum.photos/id/842/1500/1500",
            isSuggested: false,
        },
        {
            id: "3",
            title: "Timeless",
            artist: "The Weeknd",
            url: "https://juke.bgocumlu.workers.dev/jukebox-tracks/yt-5EpyN_6dqyk.mp3",
            source: "html5",
            duration: 255,
            artwork: "https://i.ytimg.com/vi/5EpyN_6dqyk/maxresdefault.jpg",
            isSuggested: false,

        },
        {
            id: "4",
            title: "Suggested Song 2",
            artist: "Artist 4",
            url: "https://example.com/suggested2.mp3",
            source: "youtube", // Red border
            duration: 200,
            artwork: "https://picsum.photos/id/842/1500/1500",
            isSuggested: true,
            votes: -2,
            userVote: null,
        },
        {
            id: "5",
            title: "Suggested Song 2",
            artist: "Artist 4",
            url: "https://example.com/suggested2.mp3",
            source: "youtube", // Red border
            duration: 200,
            artwork: "https://picsum.photos/id/842/1500/1500",
            isSuggested: true,
            votes: -2,
            userVote: null,
        },
        {
            id: "6",
            title: "Suggested Song 2",
            artist: "Artist 4",
            url: "https://example.com/suggested2.mp3",
            source: "youtube", // Red border
            duration: 200,
            artwork: "https://picsum.photos/id/842/1500/1500",
            isSuggested: true,
            votes: -2,
            userVote: null,
        },
    ]);
    
    // Use external queue if provided, otherwise use internal state
    const queueItems = externalQueueItems || internalQueueItems;
    
    // Helper to update queue items (handles both internal and external)
    const updateQueueItems = (updater: QueueItem[] | ((items: QueueItem[]) => QueueItem[])) => {
        if (onQueueItemsChange) {
            // External control - call the callback
            const newItems = typeof updater === 'function' 
                ? updater(queueItems) 
                : updater;
            onQueueItemsChange(newItems);
        } else {
            // Internal state
            if (typeof updater === 'function') {
                setInternalQueueItems(updater);
            } else {
                setInternalQueueItems(updater);
            }
        }
    };

    const formatDuration = (seconds?: number): string => {
        if (!seconds) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const handleVote = async (itemId: string, vote: "up" | "down") => {
        // Optimistic update
        const optimisticUpdate = (items: QueueItem[]) =>
            items.map(item => {
                if (item.id === itemId && item.isSuggested) {
                    const currentVote = item.userVote;
                    let newVotes = item.votes || 0;
                    
                    // Remove previous vote if exists
                    if (currentVote === "up") newVotes -= 1;
                    if (currentVote === "down") newVotes += 1;
                    
                    // Add new vote
                    if (vote === "up") newVotes += 1;
                    if (vote === "down") newVotes -= 1;
                    
                    // If clicking same vote, remove it
                    const newUserVote = currentVote === vote ? null : vote;
                    if (currentVote === vote) {
                        if (vote === "up") newVotes -= 1;
                        if (vote === "down") newVotes += 1;
                    }
                    
                    return {
                        ...item,
                        votes: newVotes,
                        userVote: newUserVote,
                    };
                }
                return item;
            });
        
        updateQueueItems(optimisticUpdate);
        
        // Call backend if provided
        if (onVote) {
            try {
                await onVote(itemId, vote);
            } catch (error) {
                // Revert on error - backend will send correct state
                console.error("Vote failed:", error);
            }
        }
    };

    const handleApprove = async (itemId: string) => {
        // Optimistic update
        updateQueueItems(items =>
            items.map(item =>
                item.id === itemId
                    ? { ...item, isSuggested: false }
                    : item
            )
        );
        
        // Call backend if provided
        if (onApprove) {
            try {
                await onApprove(itemId);
            } catch (error) {
                console.error("Approve failed:", error);
            }
        }
    };

    const handleDelete = async (itemId: string) => {
        // Optimistic update
        updateQueueItems(items => items.filter(item => item.id !== itemId));
        
        // Call backend if provided
        if (onDelete) {
            try {
                await onDelete(itemId);
            } catch (error) {
                console.error("Delete failed:", error);
            }
        }
    };

    const handleReorder = async (itemId: string, direction: "up" | "down") => {
        // Optimistic update
        const optimisticUpdate = (items: QueueItem[]) => {
            const index = items.findIndex(item => item.id === itemId);
            if (index === -1) return items;
            
            const newIndex = direction === "up" ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= items.length) return items;
            
            const newItems = [...items];
            [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];
            return newItems;
        };
        
        updateQueueItems(optimisticUpdate);
        
        // Call backend if provided
        if (onReorder) {
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

                {/* Tabs */}
                <div className="flex gap-1 mt-4">
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
                                        className={cn(
                                            "flex items-center gap-3 p-3 rounded-lg border flex-1 transition-colors relative",
                                            item.source === "youtube" && "border-red-500",
                                            isCurrentTrack && "bg-primary/10 border-primary",
                                            isNextTrack && "bg-muted/30",
                                            !isEditMode && "hover:bg-muted/50"
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
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold truncate">{item.title}</div>
                                            <div className="text-sm text-muted-foreground truncate">
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
                                            className={cn(
                                                "p-1 rounded hover:bg-muted transition-colors",
                                                item.userVote === "up" && "bg-primary/20"
                                            )}
                                        >
                                            <ChevronUp className="h-4 w-4" />
                                        </button>
                                        <span className="text-sm font-medium min-w-[2rem] text-center">
                                            {item.votes ?? 0}
                                        </span>
                                        <button
                                            onClick={() => handleVote(item.id, "down")}
                                            className={cn(
                                                "p-1 rounded hover:bg-muted transition-colors",
                                                item.userVote === "down" && "bg-primary/20"
                                            )}
                                        >
                                            <ChevronDown className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}

                                {/* Edit mode actions (host only) - Outside card, right side */}
                                {isEditMode && mode === "host" && (
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
                        <input
                            type="text"
                            placeholder="Search for songs..."
                            className="w-full px-4 py-2 border rounded-lg mb-4"
                        />
                        <p className="text-sm text-muted-foreground">
                            Search functionality will be implemented here
                        </p>
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
                    >
                        {isEditMode ? "Done Editing" : "Edit Queue"}
                    </Button>
                )}
            </div>
        </div>
    );
}

