import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";

const API_BASE = "http://192.168.1.2:8000";

// API functions
const searchYouTubeAPI = async (query: string) => {
    const response = await fetch(
        `${API_BASE}/api/youtube/search?q=${encodeURIComponent(query)}&max_results=10`
    );
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
};

const getVideoInfoAPI = async (videoId: string) => {
    const response = await fetch(`${API_BASE}/api/youtube/info/${videoId}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
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

function About() {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
    const [selectedDownloadVideoId, setSelectedDownloadVideoId] = useState<string | null>(null);
    const [debugLog, setDebugLog] = useState<string[]>([]);

    const addLog = (message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setDebugLog((prev) => [...prev, `[${timestamp}] ${message}`]);
        console.log(message);
    };

    // Search query - only enabled when we have a query
    const {
        data: searchResults = [],
        isLoading: isSearching,
        error: searchError,
        refetch: refetchSearch,
    } = useQuery({
        queryKey: ["youtube-search", searchQuery],
        queryFn: () => searchYouTubeAPI(searchQuery),
        enabled: false, // Manual trigger
        retry: 1,
    });

    // Video info query
    const {
        data: videoInfo,
        isLoading: isLoadingInfo,
        error: infoError,
    } = useQuery({
        queryKey: ["youtube-info", selectedVideoId],
        queryFn: () => getVideoInfoAPI(selectedVideoId!),
        enabled: !!selectedVideoId,
        retry: 1,
    });

    // Download URL query
    const {
        data: downloadUrlData,
        isLoading: isLoadingUrl,
        error: urlError,
    } = useQuery({
        queryKey: ["youtube-download-url", selectedDownloadVideoId],
        queryFn: () => getDownloadUrlAPI(selectedDownloadVideoId!),
        enabled: !!selectedDownloadVideoId,
        retry: 1,
    });

    // Download mutation
    const [downloadResult, setDownloadResult] = useState<any>(null);
    const downloadMutation = useMutation({
        mutationFn: downloadVideoAPI,
        onSuccess: (data, videoId) => {
            setDownloadResult(data);
            addLog(`Upload completed for video: ${videoId}`);
            addLog(`File uploaded to Supabase: ${data.url}`);
            addLog(`Filename: ${data.filename}`);
        },
        onError: (error: any) => {
            addLog(`Download/Upload error: ${error.message}`);
        },
    });

    // Log effects
    useEffect(() => {
        if (searchResults.length > 0) {
            addLog(`Found ${searchResults.length} results`);
        }
    }, [searchResults]);

    useEffect(() => {
        if (searchError) {
            addLog(`Search error: ${(searchError as Error).message}`);
        }
    }, [searchError]);

    useEffect(() => {
        if (videoInfo) {
            addLog(`Video info retrieved: ${videoInfo.title}`);
        }
    }, [videoInfo]);

    useEffect(() => {
        if (infoError) {
            addLog(`Info error: ${(infoError as Error).message}`);
        }
    }, [infoError]);

    useEffect(() => {
        if (downloadUrlData?.url) {
            addLog(`Download URL retrieved: ${downloadUrlData.url.substring(0, 50)}...`);
        }
    }, [downloadUrlData]);

    useEffect(() => {
        if (urlError) {
            addLog(`URL error: ${(urlError as Error).message}`);
        }
    }, [urlError]);

    const handleSearch = () => {
        if (!searchQuery.trim()) {
            addLog("Search query is empty");
            return;
        }
        addLog(`Searching for: "${searchQuery}"`);
        refetchSearch();
    };

    const handleGetInfo = (videoId: string) => {
        addLog(`Getting info for video: ${videoId}`);
        setSelectedVideoId(videoId);
    };

    const handleGetDownloadUrl = (videoId: string) => {
        addLog(`Getting download URL for video: ${videoId}`);
        setSelectedDownloadVideoId(videoId);
    };

    const handleDownload = (videoId: string) => {
        addLog(`Downloading video: ${videoId}`);
        downloadMutation.mutate(videoId);
    };

    const error = searchError || infoError || urlError || downloadMutation.error;

    return (
        <div className="h-full overflow-y-auto p-6">
            <h2 className="text-2xl font-semibold mb-4">YouTube API Demo & Debug</h2>

            {/* Search Section */}
            <div className="mb-6 p-4 border rounded-lg">
                <h3 className="text-xl font-semibold mb-2">Search YouTube</h3>
                <div className="flex gap-2 mb-4">
                    <Input
                        type="text"
                        placeholder="Search for videos..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                        className="flex-1"
                    />
                    <Button onClick={handleSearch} disabled={isSearching}>
                        {isSearching ? "Searching..." : "Search"}
                    </Button>
                </div>

                {error && (
                    <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">
                        Error: {(error as Error).message}
                    </div>
                )}

                {/* Search Results */}
                {searchResults.length > 0 && (
                    <div className="mt-4">
                        <h4 className="font-semibold mb-2">Search Results ({searchResults.length}):</h4>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {searchResults.map((result: { id: string; title: string; channel?: string; duration?: number; thumbnail?: string }) => (
                                <div
                                    key={result.id}
                                    className="p-3 border rounded hover:bg-gray-50"
                                >
                                    <div className="flex gap-3">
                                        {result.thumbnail && (
                                            <img
                                                src={result.thumbnail}
                                                alt={result.title}
                                                className="w-24 h-16 object-cover rounded"
                                            />
                                        )}
                                        <div className="flex-1">
                                            <h5 className="font-semibold">{result.title}</h5>
                                            <p className="text-sm text-gray-600">
                                                {result.channel} • {result.duration ? `${Math.floor(result.duration / 60)}:${(result.duration % 60).toString().padStart(2, "0")}` : "Unknown duration"}
                                            </p>
                                            <div className="flex gap-2 mt-2">
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleGetInfo(result.id)}
                                                    disabled={isLoadingInfo}
                                                >
                                                    Get Info
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleGetDownloadUrl(result.id)}
                                                    disabled={isLoadingUrl}
                                                >
                                                    Get URL
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleDownload(result.id)}
                                                    disabled={downloadMutation.isPending}
                                                >
                                                    {downloadMutation.isPending ? "Downloading..." : "Download"}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Video Info Section */}
            {videoInfo && (
                <div className="mb-6 p-4 border rounded-lg bg-blue-50">
                    <h3 className="text-xl font-semibold mb-2">Video Info</h3>
                    <pre className="text-xs overflow-auto max-h-64 bg-white p-2 rounded">
                        {JSON.stringify(videoInfo, null, 2)}
                    </pre>
                </div>
            )}

            {/* Download Result Section */}
            {downloadResult && (
                <div className="mb-6 p-4 border rounded-lg bg-purple-50">
                    <h3 className="text-xl font-semibold mb-2">Upload Result</h3>
                    <div className="space-y-2">
                        <p className="text-sm"><strong>Title:</strong> {downloadResult.title}</p>
                        <p className="text-sm"><strong>Filename:</strong> {downloadResult.filename}</p>
                        <p className="text-sm"><strong>Size:</strong> {(downloadResult.size / 1024 / 1024).toFixed(2)} MB</p>
                        <div className="break-all text-sm bg-white p-2 rounded">
                            <strong>Supabase URL:</strong><br />
                            {downloadResult.url}
                        </div>
                        <div className="flex gap-2 mt-2">
                            <Button
                                onClick={() => {
                                    window.open(downloadResult.url, "_blank");
                                    addLog("Opened Supabase URL in new tab");
                                }}
                            >
                                Open URL
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    navigator.clipboard.writeText(downloadResult.url);
                                    addLog("URL copied to clipboard");
                                }}
                            >
                                Copy URL
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Download URL Section */}
            {downloadUrlData?.url && (
                <div className="mb-6 p-4 border rounded-lg bg-green-50">
                    <h3 className="text-xl font-semibold mb-2">Direct Stream URL</h3>
                    {isLoadingUrl && <p className="text-sm text-gray-600">Loading URL...</p>}
                    <div className="break-all text-sm bg-white p-2 rounded">
                        {downloadUrlData.url}
                    </div>
                    <Button
                        className="mt-2"
                        onClick={() => {
                            window.open(downloadUrlData.url, "_blank");
                            addLog("Opened download URL in new tab");
                        }}
                    >
                        Open URL
                    </Button>
                </div>
            )}

            {/* Debug Log Section */}
            <div className="mb-6 p-4 border rounded-lg bg-gray-50">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xl font-semibold">Debug Log</h3>
                    <Button
                        size="sm"
                        onClick={() => setDebugLog([])}
                    >
                        Clear Log
                    </Button>
                </div>
                <div className="bg-black text-green-400 p-3 rounded font-mono text-xs max-h-64 overflow-y-auto">
                    {debugLog.length === 0 ? (
                        <div className="text-gray-500">No logs yet...</div>
                    ) : (
                        debugLog.map((log, idx) => (
                            <div key={idx}>{log}</div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

export default About;