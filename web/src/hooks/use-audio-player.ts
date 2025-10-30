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

  // Load track
  const loadTrack = useCallback(
    async (track: Track) => {
      // Destroy previous adapter
      if (adapterRef.current) {
        adapterRef.current.destroy()
      }

      // Create new adapter
      const adapter = AudioAdapterFactory.createAdapter(track.source, containerIdRef.current)
      adapterRef.current = adapter

      // Setup event listeners
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

      // Load the track
      await adapter.load(track.url)
      setCurrentTrack(track)

      if (playerState.isPlaying) {
        await adapter.play()
      }
    },
    [mode, onTimeSync, onTrackEnd, playerState.isPlaying],
  )

  // Play
  const play = useCallback(async () => {
    if (adapterRef.current) {
      await adapterRef.current.play()
      if (mode === "listener") {
        setPlayerState((prev) => ({ ...prev, isLive: true }))
      }
    }
  }, [mode])

  // Pause
  const pause = useCallback(() => {
    if (adapterRef.current) {
      adapterRef.current.pause()
      if (mode === "listener") {
        setPlayerState((prev) => ({ ...prev, isLive: false }))
      }
    }
  }, [mode])

  // Seek (only for host mode or when not live in listener mode)
  const seek = useCallback(
    (time: number) => {
      if (mode === "host" && adapterRef.current) {
        adapterRef.current.seek(time)
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
