"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { PlayerState, Track, PlayerMode, AudioPlayerAdapter, RepeatMode } from "@/types/audio-player"
import { AudioAdapterFactory } from "@/lib/audio-adapters/adapter-factory"

interface UseAudioPlayerOptions {
  mode?: PlayerMode
  onTrackEnd?: () => void
  onTimeSync?: (time: number) => void // For syncing with server in listener mode
}

export function useAudioPlayer(options: UseAudioPlayerOptions = {}) {
  const { mode = "host", onTrackEnd, onTimeSync } = options

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    isBuffering: false,
    isLive: true,
    shuffle: false,
    repeat: "off",
  })

  const adapterRef = useRef<AudioPlayerAdapter | null>(null)
  const containerIdRef = useRef<string>(`player-${Math.random().toString(36).substr(2, 9)}`)
  // Track if user has interacted with the player (required for mobile autoplay)
  const hasUserInteractedRef = useRef<boolean>(false)
  // Track current source type to reuse adapter when possible (preserves Safari user interaction context)
  const currentSourceRef = useRef<"html5" | "youtube" | "soundcloud" | "howler" | null>(null)

  // Update Media Session metadata
  const updateMediaSession = useCallback((track: Track | null, isPlaying: boolean) => {
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      if (track) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: "",
          artwork: track.artwork
            ? [
                {
                  src: track.artwork,
                  sizes: "512x512",
                  type: "image/png",
                },
              ]
            : [],
        })
      }

      // Media Session action handlers are set up in component to trigger events

      // Update playback state
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused"
    }
  }, [mode])

  // Update Media Session position state
  useEffect(() => {
    if (typeof navigator !== "undefined" && "mediaSession" in navigator && currentTrack && adapterRef.current) {
      if ("setPositionState" in navigator.mediaSession) {
        // Only set position state if duration is valid and current time is within bounds
        const duration = playerState.duration || 0
        const currentTime = playerState.currentTime || 0
        
        // Ensure duration is valid (> 0) and current time doesn't exceed duration
        if (duration > 0 && currentTime >= 0 && currentTime <= duration) {
          try {
            navigator.mediaSession.setPositionState({
              duration: duration,
              playbackRate: 1.0,
              position: currentTime,
            })
          } catch (error) {
            // Silently handle errors (e.g., if position state can't be set)
            console.debug("Failed to set MediaSession position state:", error)
          }
        }
      }
    }
  }, [currentTrack, playerState.currentTime, playerState.duration])

  // Load track
  const loadTrack = useCallback(
    async (track: Track) => {
      // Only destroy and recreate adapter if source type changed
      // Reusing the same adapter instance preserves Safari's user interaction context
      // This is critical for Safari - it maintains user interaction per audio element
      const needsNewAdapter = !adapterRef.current || currentSourceRef.current !== track.source
      
      if (needsNewAdapter) {
        // Destroy previous adapter
        if (adapterRef.current) {
          console.debug(`[AudioPlayer] Destroying previous adapter (source: ${currentSourceRef.current})`)
          adapterRef.current.destroy()
        }

        // Create new adapter
        console.debug(`[AudioPlayer] Creating new adapter (source: ${track.source})`)
        const adapter = AudioAdapterFactory.createAdapter(track.source, containerIdRef.current)
        adapterRef.current = adapter
        currentSourceRef.current = track.source

        // Setup event listeners (only needed when creating new adapter)
        adapter.onTimeUpdate((time) => {
          setPlayerState((prev) => ({ ...prev, currentTime: time }))
          if (mode === "listener" && onTimeSync) {
            onTimeSync(time)
          }
        })

        adapter.onDurationChange((duration) => {
          setPlayerState((prev) => ({ ...prev, duration }))
        })

        adapter.onPlay(() => {
          setPlayerState((prev) => ({ ...prev, isPlaying: true }))
        })

        adapter.onPause(() => {
          setPlayerState((prev) => ({ ...prev, isPlaying: false }))
        })

        adapter.onEnded(() => {
          setPlayerState((prev) => ({ ...prev, isPlaying: false }))
          onTrackEnd?.()
        })

        adapter.onBuffering((isBuffering) => {
          setPlayerState((prev) => ({ ...prev, isBuffering }))
        })
      } else {
        console.debug(`[AudioPlayer] Reusing existing adapter (source: ${track.source})`)
      }

      // Get the adapter (either newly created or reused)
      const adapter = adapterRef.current!

      // Load the track (this will reuse the same audio element for HTML5, preserving Safari context)
      await adapter.load(track.url)
      setCurrentTrack(track)

      // Apply persisted volume/mute on the adapter
      try {
        const persistedVolume = localStorage.getItem("jukebox.volume")
        const persistedMuted = localStorage.getItem("jukebox.isMuted")
        if (persistedVolume !== null) {
          const v = Math.max(0, Math.min(1, parseFloat(persistedVolume)))
          adapter.setVolume(v)
          setPlayerState((prev) => ({ ...prev, volume: v }))
        }
        if (persistedMuted !== null) {
          const isMuted = persistedMuted === "true"
          if (isMuted) adapter.mute()
          else adapter.unmute()
          setPlayerState((prev) => ({ ...prev, isMuted }))
        }
      } catch {}

      // Only attempt autoplay if user has interacted (required for mobile browsers)
      // This allows autoplay to work after the first user interaction
      // Reusing the same audio element means Safari will honor the previous user interaction
      if (playerState.isPlaying && hasUserInteractedRef.current) {
        try {
          await adapter.play()
        } catch (error: any) {
          // Ignore AbortError - this happens when play() is interrupted by pause()
          if (error?.name === "AbortError") {
            return // Silently ignore AbortError
          }
          // Autoplay failed (e.g., on mobile without user interaction)
          // Silently handle - user will need to press play
          console.debug("Autoplay failed:", error)
          setPlayerState((prev) => ({ ...prev, isPlaying: false }))
        }
      }

      // Update Media Session metadata
      updateMediaSession(track, playerState.isPlaying)
    },
    [mode, onTimeSync, onTrackEnd, playerState.isPlaying, updateMediaSession],
  )

  // Play
  const play = useCallback(async () => {
    if (adapterRef.current) {
      // Mark that user has interacted (enables autoplay for future track changes on mobile)
      hasUserInteractedRef.current = true
      try {
        await adapterRef.current.play()
        if (mode === "listener") {
          setPlayerState((prev) => ({ ...prev, isLive: true }))
        }
        // Update Media Session
        updateMediaSession(currentTrack, true)
      } catch (error: any) {
        // Ignore AbortError - this happens when play() is interrupted by pause()
        // This is expected behavior and not an actual error
        if (error?.name === "AbortError") {
          return // Silently ignore AbortError
        }
        // Re-throw other errors (like NotAllowedError for autoplay blocking)
        throw error
      }
    }
  }, [mode, currentTrack, updateMediaSession])

  // Pause
  const pause = useCallback(() => {
    if (adapterRef.current) {
      adapterRef.current.pause()
      if (mode === "listener") {
        setPlayerState((prev) => ({ ...prev, isLive: false }))
      }
      // Update Media Session
      updateMediaSession(currentTrack, false)
    }
  }, [mode, currentTrack, updateMediaSession])

  // Programmatic seek: always allowed; UI gating handled in component
  const seek = useCallback(
    (time: number) => {
      if (adapterRef.current) {
        adapterRef.current.seek(time)
        if (mode === "listener") {
          setPlayerState((prev) => ({ ...prev, isLive: false }))
        }
      }
    },
    [mode],
  )

  const skipForward = useCallback(
    (seconds = 5) => {
      if (adapterRef.current && mode === "host") {
        const newTime = Math.min(playerState.currentTime + seconds, playerState.duration)
        adapterRef.current.seek(newTime)
      }
    },
    [mode, playerState.currentTime, playerState.duration],
  )

  const skipBackward = useCallback(
    (seconds = 5) => {
      if (adapterRef.current && mode === "host") {
        const newTime = Math.max(playerState.currentTime - seconds, 0)
        adapterRef.current.seek(newTime)
      }
    },
    [mode, playerState.currentTime],
  )

  // Go live (for listener mode)
  const goLive = useCallback(
    (liveTime: number) => {
      if (mode === "listener" && adapterRef.current) {
        adapterRef.current.seek(liveTime)
        setPlayerState((prev) => ({ ...prev, isLive: true }))
        play()
      }
    },
    [mode, play],
  )

  // Set volume
  const setVolume = useCallback((volume: number) => {
    if (adapterRef.current) {
      adapterRef.current.setVolume(volume)
      setPlayerState((prev) => ({ ...prev, volume }))
      try {
        localStorage.setItem("jukebox.volume", String(Math.max(0, Math.min(1, volume))))
      } catch {}
    }
  }, [])

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (adapterRef.current) {
      if (playerState.isMuted) {
        adapterRef.current.unmute()
      } else {
        adapterRef.current.mute()
      }
      setPlayerState((prev) => ({ ...prev, isMuted: !prev.isMuted }))
      try {
        localStorage.setItem("jukebox.isMuted", String(!playerState.isMuted))
      } catch {}
    }
  }, [playerState.isMuted])

  const toggleShuffle = useCallback(() => {
    setPlayerState((prev) => ({ ...prev, shuffle: !prev.shuffle }))
  }, [])

  const toggleRepeat = useCallback(() => {
    setPlayerState((prev) => {
      const modes: RepeatMode[] = ["off", "all", "one"]
      const currentIndex = modes.indexOf(prev.repeat)
      const nextMode = modes[(currentIndex + 1) % modes.length]
      return { ...prev, repeat: nextMode }
    })
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      if (adapterRef.current) {
        adapterRef.current.destroy()
      }
    }
  }, [])

  // Update Media Session when track or playing state changes
  useEffect(() => {
    updateMediaSession(currentTrack, playerState.isPlaying)
  }, [currentTrack, playerState.isPlaying, updateMediaSession])

  // On mount, hydrate initial volume/mute from localStorage
  useEffect(() => {
    try {
      const persistedVolume = localStorage.getItem("jukebox.volume")
      const persistedMuted = localStorage.getItem("jukebox.isMuted")
      setPlayerState((prev) => ({
        ...prev,
        volume: persistedVolume !== null ? Math.max(0, Math.min(1, parseFloat(persistedVolume))) : prev.volume,
        isMuted: persistedMuted !== null ? persistedMuted === "true" : prev.isMuted,
      }))
    } catch {}
  }, [])

  return {
    currentTrack,
    playerState,
    loadTrack,
    play,
    pause,
    seek,
    skipForward,
    skipBackward,
    goLive,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    containerId: containerIdRef.current,
  }
}
