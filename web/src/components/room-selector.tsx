import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Plus, Users, Music, ChevronDown, LogOut } from "lucide-react";
import { cn } from "../lib/utils";

interface Room {
    slug: string;
    user_count: number;
    queue_length: number;
    created_at: number;
    has_host: boolean;
}

interface RoomSelectorProps {
    ws: WebSocket | null;
    currentRoom: string;
    onRoomChange?: (roomSlug: string) => void;
}

export function RoomSelector({ ws: _ws, currentRoom, onRoomChange }: RoomSelectorProps) {
    const [searchQuery, setSearchQuery] = useState(currentRoom || "");
    const [isOpen, setIsOpen] = useState(false);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [_page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [roomExists, setRoomExists] = useState<boolean | null>(null);
    const [checkingRoom, setCheckingRoom] = useState(false);
    const [_currentRoomInfo, setCurrentRoomInfo] = useState<Room | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const observerTarget = useRef<HTMLDivElement>(null);
    const loadRoomsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadingPagesRef = useRef<Set<number>>(new Set());

    // Update search query when currentRoom changes
    useEffect(() => {
        if (currentRoom && !isOpen) {
            setSearchQuery(currentRoom);
        }
    }, [currentRoom, isOpen]);

    // Check if room exists when search query changes - using API (debounced)
    useEffect(() => {
        const roomName = searchQuery.trim();
        if (roomName === "" || nameToSlug(roomName) === currentRoom.toLowerCase()) {
            setRoomExists(null);
            setCheckingRoom(false);
            return;
        }

        // Convert name to slug for checking
        const slug = nameToSlug(roomName);

        // Debounce room existence check (300ms)
        const timeoutId = setTimeout(async () => {
            setCheckingRoom(true);
            try {
                const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
                const response = await fetch(`${apiBase}/api/rooms?search=${encodeURIComponent(slug)}&limit=1`);
                if (response.ok) {
                    const data = await response.json();
                    // Check if any room matches exactly
                    const exactMatch = data.rooms.some((room: Room) => room.slug.toLowerCase() === slug);
                    setRoomExists(exactMatch);
                } else {
                    setRoomExists(false);
                }
            } catch (error) {
                console.error("Failed to check room existence:", error);
                setRoomExists(false);
            } finally {
                setCheckingRoom(false);
            }
        }, 100);

        return () => clearTimeout(timeoutId);
    }, [searchQuery, currentRoom]);

    // WebSocket messages are no longer used for room listing (using API now)
    // Keeping this for potential future use

    // Load rooms when dropdown opens - using REST API
    const loadRooms = useCallback(async (pageNum: number = 0, search: string = "") => {
        // Prevent duplicate requests for the same page
        if (loadingPagesRef.current.has(pageNum)) {
            return;
        }

        loadingPagesRef.current.add(pageNum);
        setIsLoading(true);
        
        try {
            const params = new URLSearchParams({
                page: pageNum.toString(),
                limit: "5",
            });
            if (search.trim()) {
                params.append("search", search.trim());
            }
            
            const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
            const response = await fetch(`${apiBase}/api/rooms?${params.toString()}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Don't filter out current room - show it in the list (will be marked as "Current")
            if (pageNum === 0) {
                setRooms(data.rooms);
                setPage(0); // Reset page when loading first page
            } else {
                // For subsequent pages, append to existing rooms
                // Use functional update to ensure we have the latest state
                setRooms(prev => {
                    // Prevent duplicates
                    const existingSlugs = new Set(prev.map(r => r.slug));
                    const newRooms = data.rooms.filter((r: Room) => !existingSlugs.has(r.slug));
                    return [...prev, ...newRooms];
                });
            }
            
            // Use backend's has_more directly (no filtering means no adjustment needed)
            setHasMore(data.has_more);
            setIsLoading(false);
            loadingPagesRef.current.delete(pageNum);
        } catch (error) {
            console.error("Failed to load rooms:", error);
            setIsLoading(false);
            loadingPagesRef.current.delete(pageNum);
            if (pageNum === 0) {
                setRooms([]);
            }
            setHasMore(false);
        }
    }, [currentRoom]);

    // Fetch current room info when it changes
    useEffect(() => {
        if (currentRoom && currentRoom.trim() !== "") {
            const fetchCurrentRoomInfo = async () => {
                try {
                    const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
                    const response = await fetch(`${apiBase}/api/rooms?search=${encodeURIComponent(currentRoom)}&limit=1`);
                    if (response.ok) {
                        const data = await response.json();
                        const roomInfo = data.rooms.find((r: Room) => r.slug === currentRoom);
                        if (roomInfo) {
                            setCurrentRoomInfo(roomInfo);
                        } else {
                            // Room might not exist in list yet, create placeholder
                            setCurrentRoomInfo({
                                slug: currentRoom,
                                user_count: 0,
                                queue_length: 0,
                                created_at: Date.now() / 1000,
                                has_host: false,
                            });
                        }
                    }
                } catch (error) {
                    console.error("Failed to fetch current room info:", error);
                }
            };
            fetchCurrentRoomInfo();
        } else {
            setCurrentRoomInfo(null);
        }
    }, [currentRoom]);

    // Open dropdown and load rooms
    const handleInputFocus = () => {
        // Clear search query when opening dropdown to show all rooms
        setSearchQuery("");
        setPage(0);
        setRooms([]);
        setHasMore(true);
        loadingPagesRef.current.clear();
        setIsOpen(true);
        loadRooms(0, ""); // Load all rooms when opening
    };

    // Infinite scroll observer
    useEffect(() => {
        if (!isOpen || !hasMore || isLoading) {
            return;
        }

        const currentTarget = observerTarget.current;
        if (!currentTarget) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isLoading) {
                    // Use functional update to get latest page value
                    setPage((currentPage) => {
                        const nextPage = currentPage + 1;
                        // Prevent duplicate requests
                        if (!loadingPagesRef.current.has(nextPage)) {
                            loadRooms(nextPage, searchQuery);
                        }
                        return nextPage;
                    });
                }
            },
            { threshold: 0.1 }
        );

        observer.observe(currentTarget);

        return () => {
            observer.disconnect();
        };
    }, [isOpen, hasMore, isLoading, searchQuery, loadRooms]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [isOpen]);

    // Validate and sanitize room name input
    // Only allows alphanumeric and spaces, max 16 characters
    const sanitizeRoomName = (value: string): string => {
        // Remove any characters that aren't alphanumeric or spaces
        const sanitized = value.replace(/[^a-zA-Z0-9 ]/g, '');
        // Limit to 16 characters
        return sanitized.slice(0, 16);
    };

    // Convert room name to slug (spaces -> hyphens)
    const nameToSlug = (name: string): string => {
        return name.trim().replace(/\s+/g, '-').toLowerCase();
    };

    // Handle search query change (debounced)
    const handleSearchChange = (value: string) => {
        // Sanitize input: only alphanumeric and spaces, max 16 chars
        const sanitized = sanitizeRoomName(value);
        setSearchQuery(sanitized);
        setPage(0); // Reset to first page
        setRooms([]); // Clear existing rooms
        setHasMore(true); // Reset hasMore flag
        loadingPagesRef.current.clear(); // Clear loading pages
        
        // Open dropdown when user starts typing
        if (!isOpen && sanitized.trim() !== "") {
            setIsOpen(true);
        }
        
        // Clear previous timeout
        if (loadRoomsTimeoutRef.current) {
            clearTimeout(loadRoomsTimeoutRef.current);
        }
        
        // Debounce room list loading (300ms)
        // Use slug for search (spaces converted to hyphens)
        if (isOpen) {
            loadRoomsTimeoutRef.current = setTimeout(() => {
                const slug = nameToSlug(sanitized);
                loadRooms(0, slug);
            }, 300);
        }
    };

    // Handle room selection
    const handleRoomSelect = (roomSlug: string) => {
        setSearchQuery(roomSlug);
        setIsOpen(false);
        if (onRoomChange && roomSlug !== currentRoom) {
            onRoomChange(roomSlug);
        }
    };

    // Handle create room
    const handleCreateRoom = () => {
        const roomName = searchQuery.trim();
        if (roomName && onRoomChange) {
            // Convert name to slug (spaces -> hyphens)
            const roomSlug = nameToSlug(roomName);
            onRoomChange(roomSlug);
            setIsOpen(false);
        }
    };

    // Handle input click - open dropdown
    const handleInputClick = () => {
        if (!isOpen) {
            // Clear search query when opening dropdown to show all rooms
            setSearchQuery("");
            setPage(0);
            setRooms([]);
            setHasMore(true);
            loadingPagesRef.current.clear();
            setIsOpen(true);
            loadRooms(0, ""); // Load all rooms when opening
        }
    };

    const showCreateButton = searchQuery.trim() !== "" && 
                             nameToSlug(searchQuery.trim()) !== currentRoom.toLowerCase() &&
                             roomExists === false &&
                             !checkingRoom;

    // Handle leave room
    const handleLeaveRoom = () => {
        // Clear the search query/room name
        setSearchQuery("");
        setIsOpen(false);
        
        // Notify parent to disconnect
        if (onRoomChange) {
            onRoomChange("");
        }
    };

    return (
        <div className="space-y-2">
            <div className="text-sm font-medium">Room</div>
            <div className="relative">
                <div className="relative">
                    <Input
                        ref={inputRef}
                        type="text"
                        placeholder="Select or create room..."
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        onFocus={handleInputFocus}
                        onClick={handleInputClick}
                        onTouchStart={handleInputClick}
                        maxLength={16}
                        className={cn(
                            "pr-9",
                            currentRoom && "pr-20"
                        )}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        {currentRoom && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 pointer-events-auto"
                                onClick={handleLeaveRoom}
                                title="Leave room"
                            >
                                <LogOut className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            </Button>
                        )}
                        <ChevronDown className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform pointer-events-none",
                            isOpen && "rotate-180"
                        )} />
                    </div>
                </div>

                {/* Dropdown */}
                {isOpen && (
                    <div
                        ref={dropdownRef}
                        className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-80 overflow-y-auto"
                    >
                        {/* Create Room Button (shown when room doesn't exist) */}
                        {showCreateButton && (
                            <div className="p-2 border-b">
                                <Button
                                    onClick={handleCreateRoom}
                                    className="w-full justify-start gap-2"
                                    variant="outline"
                                >
                                    <Plus className="h-4 w-4" />
                                    {searchQuery}
                                </Button>
                            </div>
                        )}

                        {/* Room List */}
                        {rooms.length > 0 ? (
                            <div className="py-1">
                                {rooms.map((room) => (
                                    <button
                                        key={room.slug}
                                        onClick={() => handleRoomSelect(room.slug)}
                                        className={cn(
                                            "w-full px-4 py-3 text-left hover:bg-muted transition-colors",
                                            room.slug === currentRoom && "bg-primary/10"
                                        )}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium truncate">{room.slug}</div>
                                                <div className="text-sm text-muted-foreground flex items-center gap-3 mt-1">
                                                    <span className="flex items-center gap-1">
                                                        <Users className="h-3 w-3" />
                                                        {room.user_count}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Music className="h-3 w-3" />
                                                        {room.queue_length}
                                                    </span>
                                                </div>
                                            </div>
                                            {room.slug === currentRoom && (
                                                <div className="text-xs text-primary font-medium ml-2">Current</div>
                                            )}
                                        </div>
                                    </button>
                                ))}
                                
                                {/* Infinite scroll trigger */}
                                {hasMore && (
                                    <div ref={observerTarget} className="h-4" />
                                )}
                                
                                {isLoading && (
                                    <div className="px-4 py-2 text-sm text-muted-foreground text-center">
                                        Loading...
                                    </div>
                                )}
                            </div>
                        ) : !isLoading ? (
                            <div className="px-4 py-8 text-sm text-muted-foreground text-center">
                                {searchQuery ? "No rooms found" : "No rooms available"}
                            </div>
                        ) : null}
                    </div>
                )}
            </div>

            {/* Current Room Display */}
            {currentRoom && (
                <div className="text-sm text-muted-foreground">
                    Current: <span className="font-medium text-foreground">{currentRoom}</span>
                </div>
            )}
            {!currentRoom && (
                <div className="text-sm text-muted-foreground">
                    No room selected. Search or create a room to join.
                </div>
            )}
        </div>
    );
}

