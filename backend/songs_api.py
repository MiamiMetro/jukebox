from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import os
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

router = APIRouter(prefix="/api/songs", tags=["songs"])


class Song(BaseModel):
    id: str
    filename: str
    url: str
    size: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    cloudflare_url: Optional[str] = None  # If using Cloudflare proxy


@router.get("/", response_model=List[Song])
async def get_all_songs(
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of songs to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination")
):
    """
    Get all songs available in Supabase storage.
    
    Args:
        limit: Maximum number of songs to return (1-1000)
        offset: Offset for pagination
    
    Returns:
        List of all available songs with their URLs
    """
    if not supabase:
        raise HTTPException(
            status_code=500,
            detail="Supabase not configured. Please set SUPABASE_URL and SUPABASE_KEY in .env file"
        )
    
    try:
        # List all files in the storage bucket
        response = supabase.storage.from_(supabase_bucket).list(
            limit=limit,
            offset=offset
        )
        
        if not response:
            return []
        
        songs = []
        cloudflare_domain = os.getenv("CLOUDFLARE_DOMAIN")  # Optional Cloudflare domain
        
        for file_info in response:
            if file_info.get('name'):
                filename = file_info['name']
                
                # Get public URL from Supabase
                public_url = supabase.storage.from_(supabase_bucket).get_public_url(filename)
                
                # If Cloudflare domain is configured, create proxy URL
                cloudflare_url = None
                if cloudflare_domain:
                    # Extract the path from Supabase URL and create Cloudflare URL
                    # Example: https://yourproject.supabase.co/storage/v1/object/public/bucket/file.mp3
                    # Becomes: https://your-cloudflare-domain.com/bucket/file.mp3
                    cloudflare_url = f"{cloudflare_domain}/{supabase_bucket}/{filename}"
                
                song = Song(
                    id=filename,  # Using filename as ID for now
                    filename=filename,
                    url=public_url,
                    size=file_info.get('metadata', {}).get('size') if isinstance(file_info.get('metadata'), dict) else None,
                    created_at=file_info.get('created_at'),
                    updated_at=file_info.get('updated_at'),
                    cloudflare_url=cloudflare_url
                )
                songs.append(song)
        
        return songs
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch songs: {str(e)}"
        )


@router.get("/search")
async def search_songs(
    q: str = Query(..., description="Search query for song filename"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of results")
):
    """
    Search for songs by filename.
    
    Args:
        q: Search query
        limit: Maximum number of results
    
    Returns:
        List of matching songs
    """
    if not supabase:
        raise HTTPException(
            status_code=500,
            detail="Supabase not configured. Please set SUPABASE_URL and SUPABASE_KEY in .env file"
        )
    
    try:
        # List all files and filter by search query
        response = supabase.storage.from_(supabase_bucket).list()
        
        if not response:
            return []
        
        query_lower = q.lower()
        matching_songs = []
        cloudflare_domain = os.getenv("CLOUDFLARE_DOMAIN")
        
        for file_info in response:
            filename = file_info.get('name', '')
            if query_lower in filename.lower():
                public_url = supabase.storage.from_(supabase_bucket).get_public_url(filename)
                
                cloudflare_url = None
                if cloudflare_domain:
                    cloudflare_url = f"{cloudflare_domain}/{supabase_bucket}/{filename}"
                
                song = Song(
                    id=filename,
                    filename=filename,
                    url=public_url,
                    size=file_info.get('metadata', {}).get('size') if isinstance(file_info.get('metadata'), dict) else None,
                    created_at=file_info.get('created_at'),
                    updated_at=file_info.get('updated_at'),
                    cloudflare_url=cloudflare_url
                )
                matching_songs.append(song)
                
                if len(matching_songs) >= limit:
                    break
        
        return matching_songs
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to search songs: {str(e)}"
        )


@router.get("/{filename}")
async def get_song_by_filename(filename: str):
    """
    Get a specific song by filename.
    
    Args:
        filename: The filename of the song
    
    Returns:
        Song information with URLs
    """
    if not supabase:
        raise HTTPException(
            status_code=500,
            detail="Supabase not configured. Please set SUPABASE_URL and SUPABASE_KEY in .env file"
        )
    
    try:
        # Get file info
        files = supabase.storage.from_(supabase_bucket).list()
        
        file_info = None
        for f in files:
            if f.get('name') == filename:
                file_info = f
                break
        
        if not file_info:
            raise HTTPException(status_code=404, detail=f"Song '{filename}' not found")
        
        public_url = supabase.storage.from_(supabase_bucket).get_public_url(filename)
        
        cloudflare_url = None
        cloudflare_domain = os.getenv("CLOUDFLARE_DOMAIN")
        if cloudflare_domain:
            cloudflare_url = f"{cloudflare_domain}/{supabase_bucket}/{filename}"
        
        return Song(
            id=filename,
            filename=filename,
            url=public_url,
            size=file_info.get('metadata', {}).get('size') if isinstance(file_info.get('metadata'), dict) else None,
            created_at=file_info.get('created_at'),
            updated_at=file_info.get('updated_at'),
            cloudflare_url=cloudflare_url
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch song: {str(e)}"
        )


@router.delete("/{filename}")
async def delete_song(filename: str):
    """
    Delete a song from Supabase storage.
    
    Args:
        filename: The filename of the song to delete
    
    Returns:
        Success message
    """
    if not supabase:
        raise HTTPException(
            status_code=500,
            detail="Supabase not configured. Please set SUPABASE_URL and SUPABASE_KEY in .env file"
        )
    
    try:
        supabase.storage.from_(supabase_bucket).remove([filename])
        
        return JSONResponse({
            "success": True,
            "message": f"Song '{filename}' deleted successfully"
        })
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete song: {str(e)}"
        )

