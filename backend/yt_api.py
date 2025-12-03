from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import yt_dlp
import json
import os
import tempfile
import shutil
import uuid
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
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'default_search': 'ytsearch',
            'skip_download': True,
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
                    
                result = SearchResult(
                    id=entry.get('id', ''),
                    title=entry.get('title', 'No title'),
                    duration=entry.get('duration'),
                    thumbnail=entry.get('thumbnail'),
                    channel=entry.get('channel', entry.get('uploader', 'Unknown')),
                    url=entry.get('url', f"https://www.youtube.com/watch?v={entry.get('id', '')}")
                )
                results.append(result)
            
            return results
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/info/{video_id}")
async def get_video_info(video_id: str):
    """
    Get detailed information about a YouTube video.
    
    Args:
        video_id: YouTube video ID
    
    Returns:
        Detailed video information including available formats
    """
    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Extract relevant information
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
    
    Args:
        download_request: Download configuration
    
    Returns:
        JSON response with Supabase URL and file information
    """
    if not supabase:
        raise HTTPException(
            status_code=500, 
            detail="Supabase not configured. Please set SUPABASE_URL and SUPABASE_KEY in .env file"
        )
    
    temp_dir = None
    try:
        url = f"https://www.youtube.com/watch?v={download_request.video_id}"
        
        # Create temporary directory for downloads
        temp_dir = tempfile.mkdtemp()
        
        # Always extract audio only (mp3 format)
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.join(temp_dir, '%(title)s.%(ext)s'),
            'quiet': False,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # First, get info to determine filename
            info = ydl.extract_info(url, download=False)
            ydl.download([url])
            
            # Find the downloaded file
            files = list(Path(temp_dir).glob('*'))
            if not files:
                raise HTTPException(status_code=500, detail="Download failed: No file created")
            
            downloaded_file = files[0]
            
            # Read file content
            with open(downloaded_file, 'rb') as f:
                file_content = f.read()
            
            # Generate unique filename for Supabase
            video_title = info.get('title', 'audio_track')
            # Sanitize filename
            safe_title = "".join(c for c in video_title if c.isalnum() or c in (' ', '-', '_')).rstrip()
            safe_title = safe_title.replace(' ', '_')[:50]  # Limit length
            unique_id = str(uuid.uuid4())[:8]
            supabase_filename = f"{safe_title}_{unique_id}.mp3"
            
            # Upload to Supabase
            try:
                response = supabase.storage.from_(supabase_bucket).upload(
                    supabase_filename,
                    file_content,
                    file_options={"content-type": "audio/mpeg", "upsert": "false"}
                )
                
                # Get public URL
                public_url = supabase.storage.from_(supabase_bucket).get_public_url(supabase_filename)
                
                # Clean up temporary files
                shutil.rmtree(temp_dir, ignore_errors=True)
                temp_dir = None
                
                return JSONResponse({
                    "success": True,
                    "video_id": download_request.video_id,
                    "title": info.get('title', 'Unknown'),
                    "duration": info.get('duration'),
                    "filename": supabase_filename,
                    "url": public_url,
                    "size": len(file_content),
                })
                
            except Exception as upload_error:
                # Check if file already exists
                if "already exists" in str(upload_error).lower() or "duplicate" in str(upload_error).lower():
                    # File exists, get the existing URL
                    public_url = supabase.storage.from_(supabase_bucket).get_public_url(supabase_filename)
                    
                    shutil.rmtree(temp_dir, ignore_errors=True)
                    temp_dir = None
                    
                    return JSONResponse({
                        "success": True,
                        "video_id": download_request.video_id,
                        "title": info.get('title', 'Unknown'),
                        "duration": info.get('duration'),
                        "filename": supabase_filename,
                        "url": public_url,
                        "message": "File already exists in storage",
                    })
                else:
                    raise HTTPException(
                        status_code=500, 
                        detail=f"Failed to upload to Supabase: {str(upload_error)}"
                    )
            
    except yt_dlp.utils.DownloadError as e:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Download error: {str(e)}")
    except HTTPException:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise
    except Exception as e:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")


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

