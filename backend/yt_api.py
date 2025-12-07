from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import yt_dlp
import json
import os
import tempfile
import shutil
import asyncio
import time
from collections import defaultdict
from dataclasses import dataclass
from enum import Enum
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Initialize Supabase client
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase_bucket = os.getenv("SUPABASE_BUCKET", "jukebox-tracks")

if not supabase_url or not supabase_key:
    print("Warning: SUPABASE_URL and SUPABASE_KEY not found in environment variables")
    supabase: Optional[Client] = None
else:
    supabase: Optional[Client] = create_client(supabase_url, supabase_key)

router = APIRouter(prefix="/api/youtube", tags=["youtube"])

# ============================================================================
# Rate Limiting System
# ============================================================================

class RateLimiter:
    """Simple token bucket rate limiter"""
    def __init__(self, max_requests: int = 5, time_window: int = 60):
        """
        Args:
            max_requests: Maximum number of requests allowed
            time_window: Time window in seconds
        """
        self.max_requests = max_requests
        self.time_window = time_window
        self.requests: Dict[str, List[float]] = defaultdict(list)
    
    def is_allowed(self, identifier: str = "default") -> bool:
        """Check if request is allowed"""
        now = time.time()
        # Clean old requests outside the time window
        self.requests[identifier] = [
            req_time for req_time in self.requests[identifier]
            if now - req_time < self.time_window
        ]
        
        # Check if under limit
        if len(self.requests[identifier]) < self.max_requests:
            self.requests[identifier].append(now)
            return True
        return False
    
    def get_retry_after(self, identifier: str = "default") -> float:
        """Get seconds until next request is allowed"""
        if not self.requests[identifier]:
            return 0
        oldest = min(self.requests[identifier])
        return max(0, self.time_window - (time.time() - oldest))

# Initialize rate limiter (5 downloads per minute by default)
# Can be configured via environment variables
rate_limiter = RateLimiter(
    max_requests=int(os.getenv("YOUTUBE_DOWNLOAD_RATE_LIMIT", "5")),
    time_window=int(os.getenv("YOUTUBE_DOWNLOAD_RATE_WINDOW", "60"))
)

# ============================================================================
# Download Queue System
# ============================================================================

@dataclass
class DownloadTask:
    """Represents a download task in the queue"""
    video_id: str
    format: str
    task_id: str
    created_at: float
    future: asyncio.Future
    status: str = "pending"  # pending, processing, completed, failed
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class DownloadQueue:
    """Manages download tasks in a queue"""
    def __init__(self, max_workers: int = 3):
        """
        Args:
            max_workers: Maximum number of concurrent downloads
        """
        self.queue: asyncio.Queue = asyncio.Queue()
        self.tasks: Dict[str, DownloadTask] = {}
        self.max_workers = max_workers
        self.workers: List[asyncio.Task] = []
        self.worker_semaphore = asyncio.Semaphore(max_workers)
        self._running = False
    
    def start_workers(self):
        """Start background workers to process the queue"""
        if not self._running:
            self._running = True
            for i in range(self.max_workers):
                worker = asyncio.create_task(self._worker(f"worker-{i}"))
                self.workers.append(worker)
    
    async def _worker(self, worker_name: str):
        """Background worker that processes download tasks"""
        while self._running:
            try:
                # Wait for a task with timeout
                task = await asyncio.wait_for(self.queue.get(), timeout=1.0)
                
                async with self.worker_semaphore:
                    task.status = "processing"
                    try:
                        # Run the blocking download operation
                        result = await asyncio.to_thread(self._process_download, task)
                        task.result = result
                        task.status = "completed"
                        task.future.set_result(result)
                    except Exception as e:
                        task.error = str(e)
                        task.status = "failed"
                        task.future.set_exception(e)
                    finally:
                        self.queue.task_done()
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"Worker {worker_name} error: {e}")
    
    def _process_download(self, task: DownloadTask) -> Dict[str, Any]:
        """Blocking function to download and upload - runs in thread pool"""
        temp_dir = None
        try:
            url = f"https://www.youtube.com/watch?v={task.video_id}"
            supabase_filename = f"yt-{task.video_id}.mp3"
            
            # Check if file already exists
            if supabase:
                try:
                    file_exists = supabase.storage.from_(supabase_bucket).exists(supabase_filename)
                    if file_exists:
                        file_info = supabase.storage.from_(supabase_bucket).info(supabase_filename)
                        public_url = supabase.storage.from_(supabase_bucket).get_public_url(supabase_filename)
                        
                        # Use Cloudflare DNS if available
                        cloudflare_domain = os.getenv("CLOUDFLARE_DOMAIN")
                        final_url = public_url
                        if cloudflare_domain:
                            final_url = f"{cloudflare_domain}/{supabase_bucket}/{supabase_filename}"
                        
                        # Get video metadata
                        ydl_opts = {
                            'quiet': True,
                            'no_warnings': True,
                            'skip_download': True,
                        }
                        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                            info = ydl.extract_info(url, download=False)
                        
                        # Get artwork from video info
                        artwork = info.get('thumbnail') or f"https://img.youtube.com/vi/{task.video_id}/maxresdefault.jpg"
                        
                        return {
                            "success": True,
                            "video_id": task.video_id,
                            "title": info.get('title', 'Unknown'),
                            "duration": info.get('duration'),
                            "artwork": artwork,
                            "filename": supabase_filename,
                            "url": final_url,
                            "size": file_info.get('size') if isinstance(file_info, dict) else None,
                            "message": "File already exists in storage",
                        }
                except Exception:
                    pass  # Continue with download if check fails
            
            # Create temporary directory
            temp_dir = tempfile.mkdtemp()
            
            # Download and extract audio
            ydl_opts = {
                'format': task.format,
                'outtmpl': os.path.join(temp_dir, '%(title)s.%(ext)s'),
                'quiet': False,
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                ydl.download([url])
                
                # Find downloaded file
                files = list(Path(temp_dir).glob('*'))
                if not files:
                    raise Exception("Download failed: No file created")
                
                downloaded_file = files[0]
                
                # Read file content
                with open(downloaded_file, 'rb') as f:
                    file_content = f.read()
                
                # Upload to Supabase
                if supabase:
                    try:
                        supabase.storage.from_(supabase_bucket).upload(
                            supabase_filename,
                            file_content,
                            file_options={"content-type": "audio/mpeg", "upsert": "true"}
                        )
                    except Exception as upload_error:
                        if "already exists" not in str(upload_error).lower() and "duplicate" not in str(upload_error).lower():
                            raise
                    
                    public_url = supabase.storage.from_(supabase_bucket).get_public_url(supabase_filename)
                    
                    # Use Cloudflare DNS if available
                    cloudflare_domain = os.getenv("CLOUDFLARE_DOMAIN")
                    final_url = public_url
                    if cloudflare_domain:
                        final_url = f"{cloudflare_domain}/{supabase_bucket}/{supabase_filename}"
                else:
                    raise Exception("Supabase not configured")
                
                # Clean up
                shutil.rmtree(temp_dir, ignore_errors=True)
                
                # Get artwork from video info
                artwork = info.get('thumbnail') or f"https://img.youtube.com/vi/{task.video_id}/maxresdefault.jpg"
                
                return {
                    "success": True,
                    "video_id": task.video_id,
                    "title": info.get('title', 'Unknown'),
                    "duration": info.get('duration'),
                    "artwork": artwork,
                    "filename": supabase_filename,
                    "url": final_url,
                    "size": len(file_content),
                }
        except Exception as e:
            if temp_dir:
                shutil.rmtree(temp_dir, ignore_errors=True)
            raise
    
    async def add_task(self, video_id: str, format: str = "bestaudio/best") -> str:
        """Add a download task to the queue"""
        task_id = f"{video_id}-{int(time.time() * 1000)}"
        future = asyncio.Future()
        
        task = DownloadTask(
            video_id=video_id,
            format=format,
            task_id=task_id,
            created_at=time.time(),
            future=future
        )
        
        self.tasks[task_id] = task
        await self.queue.put(task)
        return task_id
    
    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get status of a download task"""
        task = self.tasks.get(task_id)
        if not task:
            return None
        
        return {
            "task_id": task_id,
            "video_id": task.video_id,
            "status": task.status,
            "created_at": task.created_at,
            "result": task.result,
            "error": task.error,
            "queue_position": self._get_queue_position(task_id)
        }
    
    def _get_queue_position(self, task_id: str) -> int:
        """Get position in queue (approximate)"""
        position = 0
        for task in list(self.tasks.values()):
            if task.task_id == task_id:
                break
            if task.status == "pending":
                position += 1
        return position

# Initialize download queue
download_queue = DownloadQueue(
    max_workers=int(os.getenv("YOUTUBE_DOWNLOAD_MAX_WORKERS", "3"))
)

# Workers will be started lazily on first use
_workers_started = False

def ensure_workers_started():
    """Ensure download queue workers are started"""
    global _workers_started
    if not _workers_started:
        download_queue.start_workers()
        _workers_started = True

# Track active downloads per IP (only 1 download at a time per IP)
active_downloads_per_ip: Dict[str, str] = {}  # IP -> task_id


def get_estimated_audio_size(video_id: str, max_size_mb: float = 10.0):
    """
    Get estimated audio file size before downloading.
    First tries to get actual format file sizes, falls back to duration-based estimation.
    Strict: Returns None if size cannot be determined (will block download).
    
    Args:
        video_id: YouTube video ID
        max_size_mb: Maximum allowed size in MB (default 10MB)
    
    Returns:
        Tuple of (estimated_size_bytes, is_over_limit, duration)
        Returns (None, True, None) if size cannot be determined (to block download)
    """
    print(f"[SIZE CHECK] Starting size check for video: {video_id} (max: {max_size_mb} MB)")
    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        duration = None
        best_size = None
        
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'socket_timeout': 10,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            duration = info.get('duration')
            
            # Try to get actual format file sizes for audio-only formats
            formats = info.get('formats', [])
            audio_formats = [
                fmt for fmt in formats 
                if fmt.get('acodec') != 'none' and (fmt.get('vcodec') == 'none' or fmt.get('vcodec') is None)
            ]
            
            if audio_formats:
                # Find best audio format (similar to what download will use)
                best_audio = max(audio_formats, key=lambda f: f.get('abr', 0) or 0)
                # Try filesize first, then filesize_approx
                best_size = best_audio.get('filesize') or best_audio.get('filesize_approx')
        
        if not duration:
            # Can't estimate without duration - block download (fail-closed)
            print(f"[SIZE CHECK] Video {video_id}: Could not get duration, blocking download")
            return None, True, None
        
        # Use actual format size if available, otherwise estimate
        if best_size:
            # Use actual format size (more accurate)
            estimated_bytes = best_size
            estimated_mb = estimated_bytes / (1024 * 1024)
            # Add 20% buffer for MP3 conversion overhead
            estimated_bytes_with_buffer = int(estimated_bytes * 1.2)
            estimated_mb_with_buffer = estimated_bytes_with_buffer / (1024 * 1024)
        else:
            # Estimate based on duration and 192 kbps MP3 encoding
            # (same as configured in download: preferredquality: '192')
            # Formula: Size (MB) = (duration_seconds * bitrate_kbps) / (8 * 1024)
            audio_bitrate_kbps = 192  # Same as download configuration
            estimated_bytes = (duration * audio_bitrate_kbps * 1024) / 8
            estimated_mb = estimated_bytes / (1024 * 1024)
            # Add 30% buffer for safety (to account for variable bitrate, headers, etc.)
            estimated_bytes_with_buffer = int(estimated_bytes * 1.3)
            estimated_mb_with_buffer = estimated_bytes_with_buffer / (1024 * 1024)
        
        is_over = estimated_mb_with_buffer > max_size_mb
        print(f"[SIZE CHECK] Video {video_id}: estimated {estimated_mb_with_buffer:.2f} MB (duration: {duration}s), over limit: {is_over}")
        return int(estimated_bytes_with_buffer), is_over, duration
            
    except Exception as e:
        # If we can't determine size, block the download (fail-closed)
        print(f"[SIZE CHECK] Video {video_id}: Error during size check: {e}, blocking download")
        return None, True, None


class SearchResult(BaseModel):
    id: str
    title: str
    duration: Optional[int] = None
    thumbnail: Optional[str] = None
    channel: Optional[str] = None
    url: str


class DownloadRequest(BaseModel):
    video_id: str
    format: Optional[str] = "bestaudio/best"  # bestaudio, best, or specific format
    extract_audio: Optional[bool] = True


@router.get("/search", response_model=List[SearchResult])
async def search_youtube(
    q: str = Query(..., description="Search query"),
    max_results: int = Query(10, ge=1, le=50, description="Maximum number of results")
):
    """
    Search YouTube for videos.
    
    Args:
        q: Search query string
        max_results: Maximum number of results to return (1-50)
    
    Returns:
        List of search results with video information
    """
    def _perform_search():
        """Blocking search function to run in thread pool"""
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'default_search': 'ytsearch',
            'skip_download': True,
            # Add timeout for mobile networks
            'socket_timeout': 30,
            # Retry on network errors
            'retries': 3,
        }
        
        search_query = f"ytsearch{max_results}:{q}"
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Extract info without downloading
            info = ydl.extract_info(search_query, download=False)
            
            if not info or 'entries' not in info:
                return []
            
            results = []
            for entry in info.get('entries', []):
                if entry is None:
                    continue
                
                video_id = entry.get('id', '')
                # Construct thumbnail URL manually since extract_flat doesn't include it
                thumbnail_url = f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg" if video_id else None
                    
                result = SearchResult(
                    id=video_id,
                    title=entry.get('title', 'No title'),
                    duration=entry.get('duration'),
                    thumbnail=thumbnail_url,
                    channel=entry.get('channel', entry.get('uploader', 'Unknown')),
                    url=entry.get('url', f"https://www.youtube.com/watch?v={video_id}")
                )
                results.append(result)
            
            return results
    
    try:
        # Run blocking search in thread pool with timeout (60 seconds for mobile networks)
        results = await asyncio.wait_for(
            asyncio.to_thread(_perform_search),
            timeout=60.0
        )
        return results
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Search request timed out. Please try again with a shorter query or check your network connection."
        )
    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(
            status_code=500,
            detail=f"YouTube search failed: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Search failed: {str(e)}"
        )


@router.get("/size-check/{video_id}")
async def check_video_size(video_id: str):
    """
    Get estimated audio file size and duration for a YouTube video.
    Also reports how long it took to get this information.
    
    Args:
        video_id: YouTube video ID
    
    Returns:
        JSON with duration, estimated_size_mb, estimated_size_bytes, and timing info
    """
    start_time = time.time()
    
    try:
        estimated_size, is_over_limit, duration = get_estimated_audio_size(
            video_id,
            max_size_mb=10.0
        )
        
        elapsed_seconds = time.time() - start_time
        
        size_mb = estimated_size / (1024 * 1024) if estimated_size else None
        
        print(f"[SIZE CHECK API] Video {video_id} - Duration: {duration}s, Size: {size_mb:.2f} MB (took {elapsed_seconds:.3f} seconds)")
        
        return {
            "video_id": video_id,
            "duration_seconds": duration,
            "estimated_size_bytes": estimated_size,
            "estimated_size_mb": round(size_mb, 2) if size_mb else None,
            "is_over_10mb_limit": is_over_limit if estimated_size else None,
            "check_duration_seconds": round(elapsed_seconds, 3),
            "success": True
        }
    except Exception as e:
        elapsed_seconds = time.time() - start_time
        print(f"[SIZE CHECK API] Video {video_id} - Error: {str(e)} (took {elapsed_seconds:.3f} seconds)")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check video size: {str(e)} (took {elapsed_seconds:.3f} seconds)"
        )


@router.get("/info/{video_id}")
async def get_video_info(
    video_id: str,
    isBriefInfo: bool = Query(False, description="If true, return only essential fields (faster, no formats)")
):
    """
    Get detailed information about a YouTube video.
    
    Args:
        video_id: YouTube video ID
        isBriefInfo: If true, return only essential fields (id, title, duration, thumbnail, channel, view_count, upload_date) without formats
    
    Returns:
        Video information. If isBriefInfo=true, returns only essential fields without formats.
    """
    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
        }
        
        # When brief info is requested, skip format extraction for faster response
        if isBriefInfo:
            ydl_opts['noplaylist'] = True
            # Don't extract format info to speed things up
            ydl_opts['extract_flat'] = False  # We still need metadata, just not formats
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            if isBriefInfo:
                # Return only essential fields for faster response
                return {
                    'id': info.get('id'),
                    'title': info.get('title'),
                    'duration': info.get('duration'),
                    'thumbnail': info.get('thumbnail'),
                    'channel': info.get('channel', info.get('uploader')),
                    'view_count': info.get('view_count'),
                    'upload_date': info.get('upload_date'),
                }
            else:
                # Full info with formats
                result = {
                    'id': info.get('id'),
                    'title': info.get('title'),
                    'description': info.get('description'),
                    'duration': info.get('duration'),
                    'thumbnail': info.get('thumbnail'),
                    'channel': info.get('channel', info.get('uploader')),
                    'view_count': info.get('view_count'),
                    'upload_date': info.get('upload_date'),
                    'formats': []
                }
                
                # Get available formats
                for fmt in info.get('formats', []):
                    format_info = {
                        'format_id': fmt.get('format_id'),
                        'ext': fmt.get('ext'),
                        'resolution': fmt.get('resolution'),
                        'filesize': fmt.get('filesize'),
                        'acodec': fmt.get('acodec'),
                        'vcodec': fmt.get('vcodec'),
                    }
                    result['formats'].append(format_info)
                
                return result
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get video info: {str(e)}")


@router.post("/download")
async def download_youtube(download_request: DownloadRequest):
    """
    Download a YouTube video and extract audio only, then upload to Supabase.
    Uses queue system and rate limiting.
    
    Args:
        download_request: Download configuration
    
    Returns:
        JSON response with task_id (for async) or immediate result if file exists
    """
    if not supabase:
        raise HTTPException(
            status_code=500, 
            detail="Supabase not configured. Please set SUPABASE_URL and SUPABASE_KEY in .env file"
        )
    
    # Check rate limit
    client_id = "default"  # In production, use request.client.host or user ID
    if not rate_limiter.is_allowed(client_id):
        retry_after = rate_limiter.get_retry_after(client_id)
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Please try again in {int(retry_after)} seconds.",
            headers={"Retry-After": str(int(retry_after))}
        )
    
    # Use YouTube video ID as filename with yt- prefix
    supabase_filename = f"yt-{download_request.video_id}.mp3"
    
    # Check if file already exists in Supabase (fast path)
    try:
        file_exists = supabase.storage.from_(supabase_bucket).exists(supabase_filename)
        if file_exists:
            # File exists, get info and return without downloading
            try:
                file_info = supabase.storage.from_(supabase_bucket).info(supabase_filename)
                public_url = supabase.storage.from_(supabase_bucket).get_public_url(supabase_filename)
                
                # Use Cloudflare DNS if available
                cloudflare_domain = os.getenv("CLOUDFLARE_DOMAIN")
                final_url = public_url
                if cloudflare_domain:
                    final_url = f"{cloudflare_domain}/{supabase_bucket}/{supabase_filename}"
                
                # Get video metadata from YouTube
                url = f"https://www.youtube.com/watch?v={download_request.video_id}"
                ydl_opts = {
                    'quiet': True,
                    'no_warnings': True,
                    'skip_download': True,
                }
                
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                
                return JSONResponse({
                    "success": True,
                    "video_id": download_request.video_id,
                    "title": info.get('title', 'Unknown'),
                    "duration": info.get('duration'),
                    "filename": supabase_filename,
                    "url": final_url,
                    "size": file_info.get('size') if isinstance(file_info, dict) else None,
                    "message": "File already exists in storage",
                })
            except Exception as e:
                # If we can't get file info, still return the URL
                public_url = supabase.storage.from_(supabase_bucket).get_public_url(supabase_filename)
                
                # Use Cloudflare DNS if available
                cloudflare_domain = os.getenv("CLOUDFLARE_DOMAIN")
                final_url = public_url
                if cloudflare_domain:
                    final_url = f"{cloudflare_domain}/{supabase_bucket}/{supabase_filename}"
                
                return JSONResponse({
                    "success": True,
                    "video_id": download_request.video_id,
                    "filename": supabase_filename,
                    "url": final_url,
                    "message": "File already exists in storage",
                })
    except Exception as e:
        # If exists check fails, continue with download
        pass
    
    # Check file size before downloading (10MB limit) - MUST pass before download
    print(f"[SIZE CHECK] Download API: Checking size for video {download_request.video_id}")
    estimated_size, is_over_limit, duration = get_estimated_audio_size(
        download_request.video_id,
        max_size_mb=10.0
    )
    
    # Block if over limit OR if we can't determine size (fail-closed)
    if is_over_limit:
        if estimated_size:
            size_mb = estimated_size / (1024 * 1024)
            duration_min = duration / 60 if duration else 0
            raise HTTPException(
                status_code=400,
                detail=f"Audio file is too large (estimated {size_mb:.2f} MB for {duration_min:.1f} min). Maximum allowed size is 10 MB."
            )
        else:
            # Size couldn't be determined but we're blocking anyway
            raise HTTPException(
                status_code=400,
                detail="Could not determine file size. Download blocked for safety. Maximum allowed size is 10 MB."
            )
    
    # Also block if we can't determine the size (double-check fail-closed)
    if estimated_size is None:
        print(f"Warning: Could not estimate file size for {download_request.video_id}, blocking download for safety")
        raise HTTPException(
            status_code=400,
            detail="Could not determine file size. Download blocked for safety. Maximum allowed size is 10 MB."
        )
    
    # Ensure workers are started
    ensure_workers_started()
    
    # Add to download queue
    try:
        task_id = await download_queue.add_task(
            download_request.video_id,
            download_request.format or "bestaudio/best"
        )
        
        # Wait for task to complete (with timeout)
        task = download_queue.tasks.get(task_id)
        if task:
            try:
                # Wait up to 10 minutes for download to complete
                result = await asyncio.wait_for(task.future, timeout=600.0)
                return JSONResponse(result)
            except asyncio.TimeoutError:
                # Return task ID for polling
                return JSONResponse({
                    "success": True,
                    "task_id": task_id,
                    "status": "processing",
                    "message": "Download queued. Use /download/status/{task_id} to check progress.",
                    "queue_position": download_queue._get_queue_position(task_id)
                })
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"Download failed: {str(e)}"
                )
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to create download task"
            )
    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(status_code=400, detail=f"Download error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")


@router.get("/download/status/{task_id}")
async def get_download_status(task_id: str):
    """
    Get the status of a download task.
    
    Args:
        task_id: Task ID returned from /download endpoint
    
    Returns:
        Task status information
    """
    status = download_queue.get_task_status(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Task not found")
    return status


@router.get("/download-url/{video_id}")
async def get_download_url(
    video_id: str,
    format: str = Query("bestaudio/best", description="Format preference")
):
    """
    Get a direct download URL for a YouTube video (without downloading to server).
    This returns the URL that can be used to stream the video directly.
    
    Args:
        video_id: YouTube video ID
        format: Format preference (bestaudio/best, best, etc.)
    
    Returns:
        Direct streaming URL
    """
    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        
        ydl_opts = {
            'format': format,
            'quiet': True,
            'no_warnings': True,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Get the best format URL
            if 'url' in info:
                return {
                    'url': info['url'],
                    'format': info.get('format'),
                    'ext': info.get('ext'),
                    'filesize': info.get('filesize'),
                }
            elif 'requested_formats' in info:
                # For formats that require multiple streams
                return {
                    'url': info['requested_formats'][0].get('url'),
                    'format': info.get('format'),
                    'ext': info.get('ext'),
                }
            else:
                raise HTTPException(status_code=500, detail="Could not extract download URL")
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get download URL: {str(e)}")

