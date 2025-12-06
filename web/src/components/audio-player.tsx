"use client"

import { useAudioPlayer } from "@/hooks/use-audio-player"
import type { Track, PlayerMode, PlayerVariant, ScrollControlOptions, PlayerState } from "@/types/audio-player"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Card } from "@/components/ui/card"
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Undo2,
  Redo2,
} from "lucide-react"
import { useEffect, useState, useRef, useMemo, useCallback } from "react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

interface AudioPlayerProps {
  track: Track | null
  mode?: PlayerMode
  variant?: PlayerVariant
  onTrackEnd?: () => void
  onTimeSync?: (time: number) => void
  events?: {
    onPlay?: () => void
    onPause?: () => void
    onSeek?: (time: number) => void
    onVolumeChange?: (volume: number) => void
    onMuteChange?: (isMuted: boolean) => void
    onShuffleChange?: (enabled: boolean) => void
    onRepeatChange?: (mode: "off" | "all" | "one") => void
    onTimeUpdate?: (time: number) => void
    onDurationChange?: (duration: number) => void
    onBufferingChange?: (isBuffering: boolean) => void
    onModeChangeRequest?: (newMode: PlayerMode) => void
  }
  liveTime?: number
  className?: string
  onNext?: () => void
  onPrevious?: () => void
  scrollControls?: ScrollControlOptions
  onPlayerReady?: (controls: PlayerControls) => void
}

export interface PlayerControls {
  play: () => Promise<void>
  pause: () => void
  seek: (time: number) => void
  skipForward: (seconds: number) => void
  skipBackward: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  getState: () => PlayerState
}

export function AudioPlayer({
  track,
  mode = "host",
  variant = "full",
  onTrackEnd,
  onTimeSync,
  events,
  liveTime = 0,
  className,
  onNext,
  onPrevious,
  scrollControls = { enableVolumeControl: true, enableTrackControl: true },
  onPlayerReady,
}: AudioPlayerProps) {
  const {
    currentTrack,
    playerState,
    loadTrack,
    play,
    pause,
    seek,
    skipForward,
    skipBackward,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    containerId,
  } = useAudioPlayer({ mode, onTrackEnd, onTimeSync })

  const [isDragging, setIsDragging] = useState(false)
  const wasPlayingBeforeSeekRef = useRef<boolean>(false)
  const isSeekingRef = useRef<boolean>(false)
  const isMobile = useIsMobile()
  const [forceMobileLayout, setForceMobileLayout] = useState(false)
  const playerRef = useRef<HTMLDivElement>(null)
  const volumeSliderRef = useRef<HTMLDivElement>(null)
  const progressSliderRef = useRef<HTMLDivElement>(null)

  // Keep latest player state in a ref so getState can read it without
  // forcing onPlayerReady effect to re-run on every state change
  const latestStateRef = useRef(playerState)
  useEffect(() => {
    latestStateRef.current = playerState
  }, [playerState])

  const controls = useMemo(
    () => ({
      play,
      pause,
      seek,
      skipForward,
      skipBackward,
      setVolume,
      toggleMute,
      toggleShuffle,
      toggleRepeat,
      getState: () => latestStateRef.current,
    }), [
    play,
    pause,
    seek,
    skipForward,
    skipBackward,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
  ]
  )

  useEffect(() => {
    if (onPlayerReady) {
      onPlayerReady(controls)
    }
  }, [onPlayerReady, controls])

  const handleSeekStart = useCallback(() => {
    if (mode === "host" && playerState.isPlaying) {
      wasPlayingBeforeSeekRef.current = true
      isSeekingRef.current = true
      pause()
      events?.onPause?.()
    } else {
      wasPlayingBeforeSeekRef.current = false
      isSeekingRef.current = true
    }
  }, [mode, playerState.isPlaying, pause, events])

  const handleSeekEnd = useCallback(() => {
    if (mode === "host" && wasPlayingBeforeSeekRef.current) {
      isSeekingRef.current = false
      play()
      events?.onPlay?.()
    } else {
      isSeekingRef.current = false
    }
    wasPlayingBeforeSeekRef.current = false
  }, [mode, play, events])

  // Set up Media Session action handlers to trigger events
  useEffect(() => {
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", async () => {
        await play()
        events?.onPlay?.()
      })

      navigator.mediaSession.setActionHandler("pause", () => {
        pause()
        events?.onPause?.()
      })

      navigator.mediaSession.setActionHandler("seekbackward", (details) => {
        if (mode === "host") {
          const skipTime = details.seekOffset || 10
          // Get current time from adapter for accurate seeking (works for both HTML5 and YouTube)
          const currentTime = controls.getState().currentTime
          const newTime = Math.max(0, currentTime - skipTime)
          seek(newTime)
          events?.onSeek?.(newTime)
        }
      })

      navigator.mediaSession.setActionHandler("seekforward", (details) => {
        if (mode === "host") {
          const skipTime = details.seekOffset || 10
          // Get current time from adapter for accurate seeking (works for both HTML5 and YouTube)
          const currentTime = controls.getState().currentTime
          const duration = controls.getState().duration
          const newTime = Math.min(duration || 0, currentTime + skipTime)
          seek(newTime)
          events?.onSeek?.(newTime)
        }
      })

      if (onPrevious) {
        navigator.mediaSession.setActionHandler("previoustrack", () => {
          if (mode === "host") {
            onPrevious()
          }
        })
      }

      if (onNext) {
        navigator.mediaSession.setActionHandler("nexttrack", () => {
          if (mode === "host") {
            onNext()
          }
        })
      }
    }
  }, [play, pause, seek, events, mode, playerState.currentTime, playerState.duration, onPrevious, onNext])

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as Node

      // Check if hovering over progress slider for track seeking (with larger hitbox)
      if (progressSliderRef.current?.contains(target)) {
        if (scrollControls.enableTrackControl && mode === "host") {
          e.preventDefault()
          const wasPlaying = playerState.isPlaying
          if (wasPlaying && !isSeekingRef.current) {
            handleSeekStart()
          }
          const seekAmount = e.deltaY > 0 ? -5 : 5
          const newTime = Math.max(0, Math.min(playerState.duration, playerState.currentTime + seekAmount))
          seek(newTime)
          events?.onSeek?.(newTime)
          // Small delay to resume if it was playing (for smooth scroll seeking)
          if (wasPlaying) {
            setTimeout(() => {
              if (isSeekingRef.current) {
                handleSeekEnd()
              }
            }, 300)
          }
        }
      }
      // Check if hovering over volume slider for volume control (with larger hitbox)
      // Disable on mobile since volume is controlled by device buttons
      else if (volumeSliderRef.current?.contains(target) && !isMobile) {
        if (scrollControls.enableVolumeControl) {
          e.preventDefault()
          const volumeChange = e.deltaY > 0 ? -0.05 : 0.05
          const newVolume = Math.max(0, Math.min(1, playerState.volume + volumeChange))
          setVolume(newVolume)
          events?.onVolumeChange?.(newVolume)
        }
      }
    }

    const element = playerRef.current
    if (element) {
      element.addEventListener("wheel", handleWheel, { passive: false })
      return () => element.removeEventListener("wheel", handleWheel)
    }
  }, [scrollControls, mode, playerState.currentTime, playerState.duration, playerState.volume, playerState.isPlaying, isMobile, seek, setVolume, events, handleSeekStart, handleSeekEnd])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if the player or its children are focused
      if (playerRef.current?.contains(document.activeElement) && mode === "host") {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault()
          const wasPlaying = playerState.isPlaying
          if (wasPlaying && !isSeekingRef.current) {
            handleSeekStart()
          }
          const seekAmount = e.key === "ArrowLeft" ? -5 : 5
          const newTime = Math.max(0, Math.min(playerState.duration, playerState.currentTime + seekAmount))
          seek(newTime)
          events?.onSeek?.(newTime)
          if (wasPlaying) {
            setTimeout(() => {
              if (isSeekingRef.current) {
                handleSeekEnd()
              }
            }, 100)
          }
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [mode, playerState.currentTime, playerState.duration, playerState.isPlaying, seek, events, handleSeekStart, handleSeekEnd])

  useEffect(() => {
    if (track && track.url !== currentTrack?.url && track.id !== "placeholder") {
      loadTrack(track)
    }
  }, [track, currentTrack, loadTrack])

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return "0:00"
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const handleSeek = (value: number[]) => {
    if (mode === "host") {
      const time = value[0]
      // Only seek if already paused (or was paused by handleSeekStart)
      if (!playerState.isPlaying || isSeekingRef.current) {
        seek(time)
        events?.onSeek?.(time)
      }
    }
  }

  const handleSkipBy = (seconds: number) => {
    if (mode !== "host") return
    const wasPlaying = playerState.isPlaying
    if (wasPlaying && !isSeekingRef.current) {
      handleSeekStart()
    }
    const newTime = Math.max(0, Math.min(playerState.duration, playerState.currentTime + seconds))
    seek(newTime)
    events?.onSeek?.(newTime)
    if (wasPlaying) {
      setTimeout(() => {
        if (isSeekingRef.current) {
          handleSeekEnd()
        }
      }, 100)
    }
  }

  const handleVolumeChange = (value: number) => {
    setVolume(value)
    events?.onVolumeChange?.(value)
  }

  const handleToggleMute = () => {
    const next = !playerState.isMuted
    toggleMute()
    events?.onMuteChange?.(next)
    // When unmuting (mute button goes up), change to listener mode and mobile layout
    if (next === false) {
      // Unmuted - trigger mode change to listener
      // This will be handled by the parent component via a callback
      if (events?.onMuteChange) {
        // The parent can listen to this and change mode
      }
    }
  }

  const handleToggleShuffle = () => {
    const next = !playerState.shuffle
    toggleShuffle()
    events?.onShuffleChange?.(next)
  }

  const handleToggleRepeat = () => {
    const modes: Array<"off" | "all" | "one"> = ["off", "all", "one"]
    const currentIndex = modes.indexOf(playerState.repeat as any)
    const nextMode = modes[(currentIndex + 1) % modes.length]
    toggleRepeat()
    events?.onRepeatChange?.(nextMode)
  }

  const handlePlayPause = () => {
    if (playerState.isPlaying) {
      pause()
      events?.onPause?.()
    } else {
      play()
      events?.onPlay?.()
    }
  }

  // Emit time/duration/buffering updates
  useEffect(() => {
    events?.onTimeUpdate?.(playerState.currentTime)
  }, [playerState.currentTime, events])

  useEffect(() => {
    events?.onDurationChange?.(playerState.duration)
  }, [playerState.duration, events])

  useEffect(() => {
    events?.onBufferingChange?.(playerState.isBuffering)
  }, [playerState.isBuffering, events])

  // Create a placeholder track when no track is provided
  const displayTrack = useMemo(() => {
    return track || {
      id: "placeholder",
      title: "No track loaded",
      artist: "Connect to server to load a track",
      source: "html5" as const,
      artwork: undefined,
      url: "",
    }
  }, [track])

  // Memoize artwork URL to prevent re-fetching on every render
  const artworkUrl = useMemo(() => {
    return displayTrack.artwork || undefined
  }, [displayTrack.artwork, displayTrack.id]) // Include track.id to change only when track changes

  // Mini player variant
  if (variant === "mini") {
    return (
      <>
        <Card
        ref={playerRef}
        tabIndex={0}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/80 focus:outline-none focus:ring-2 focus:ring-primary/20",
          className,
        )}
      >
        {/* Track name and volume at top */}
        <div className="flex flex-col gap-1.5 p-2 md:hidden">
          {/* Track name and volume at top */}
          <div className="flex items-center gap-2 min-w-0">
            {artworkUrl && (
              <img
                key={`artwork-${displayTrack.id}`}
                src={artworkUrl}
                alt={displayTrack.title}
                className="h-9 w-9 rounded object-cover shrink-0"
                loading="lazy"
                decoding="async"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{displayTrack.title}</p>
              <p className="text-xs text-muted-foreground truncate">{displayTrack.artist}</p>
            </div>
            {/* Volume control in top right - hide slider on mobile (uses device volume) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="icon" variant="ghost" onClick={handleToggleMute} className="h-7 w-7">
                {playerState.isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </Button>
              {!isMobile && (
                <div ref={volumeSliderRef} className="w-16 py-2">
                  <Slider
                    value={[playerState.isMuted ? 0 : playerState.volume]}
                    max={1}
                    step={0.01}
                    onValueChange={(value) => handleVolumeChange(value[0])}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Progress slider with time stamps */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-9 text-right shrink-0">
              {formatTime(playerState.currentTime)}
            </span>
            <div ref={progressSliderRef} className="flex-1 py-3">
              <Slider
                value={[playerState.currentTime]}
                max={playerState.duration || 100}
                step={0.1}
                onValueChange={handleSeek}
                onPointerDown={handleSeekStart}
                onPointerUp={handleSeekEnd}
                disabled={mode === "listener"}
              />
            </div>
            <span className="text-xs text-muted-foreground w-9 shrink-0">{formatTime(playerState.duration)}</span>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-0 justify-center">
            {mode === "host" && (
              <Button
                size="icon"
                variant="ghost"
                onClick={handleToggleShuffle}
                className={cn(
                  "h-8 w-8 transition-colors",
                  playerState.shuffle && "bg-primary/20 text-primary hover:bg-primary/30",
                )}
              >
                <Shuffle className="h-3.5 w-3.5" />
              </Button>
            )}
            {onPrevious && mode === "host" && (
              <Button size="icon" variant="ghost" onClick={onPrevious} className="h-8 w-8">
                <SkipBack className="h-3.5 w-3.5" />
              </Button>
            )}
            {mode === "host" && (
              <Button size="icon" variant="ghost" onClick={() => handleSkipBy(-5)} className="h-8 w-8">
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="icon" onClick={handlePlayPause} className="h-9 w-9 mx-1">
              {playerState.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            {mode === "host" && (
              <Button size="icon" variant="ghost" onClick={() => handleSkipBy(5)} className="h-8 w-8">
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {onNext && mode === "host" && (
              <Button size="icon" variant="ghost" onClick={onNext} className="h-8 w-8">
                <SkipForward className="h-3.5 w-3.5" />
              </Button>
            )}
            {mode === "host" && (
              <Button
                size="icon"
                variant="ghost"
                onClick={handleToggleRepeat}
                className={cn(
                  "h-8 w-8 transition-colors",
                  playerState.repeat !== "off" && "bg-primary/20 text-primary hover:bg-primary/30",
                )}
              >
                {playerState.repeat === "one" ? <Repeat1 className="h-3.5 w-3.5" /> : <Repeat className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        </div>

        {/* Desktop layout */}
        <div className="hidden md:flex flex-col gap-1.5 p-3">
          {/* Top row: Track info and main controls */}
          <div className="flex items-center gap-3">
            {/* Track info */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {artworkUrl && (
                <img
                  key={`artwork-${displayTrack.id}`}
                  src={artworkUrl}
                  alt={displayTrack.title}
                  className="h-14 w-14 rounded object-cover shrink-0"
                  loading="lazy"
                  decoding="async"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-base truncate">{displayTrack.title}</p>
                <p className="text-xs text-muted-foreground truncate">{displayTrack.artist}</p>
              </div>
            </div>

            {/* Desktop controls */}
            <div className="flex items-center gap-1 shrink-0">
              {mode === "host" && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleToggleShuffle}
                  className={cn(
                    "h-9 w-9 transition-colors",
                    playerState.shuffle && "bg-primary/20 text-primary hover:bg-primary/30",
                  )}
                >
                  <Shuffle className="h-4 w-4" />
                </Button>
              )}
              {onPrevious && mode === "host" && (
                <Button size="icon" variant="ghost" onClick={onPrevious} className="h-9 w-9">
                  <SkipBack className="h-4 w-4" />
                </Button>
              )}
              {mode === "host" && (
                <Button size="icon" variant="ghost" onClick={() => handleSkipBy(-5)} className="h-9 w-9">
                  <Undo2 className="h-4 w-4" />
                </Button>
              )}
              <Button size="icon" onClick={handlePlayPause} className="h-10 w-10">
                {playerState.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>
              {mode === "host" && (
                <Button size="icon" variant="ghost" onClick={() => handleSkipBy(5)} className="h-9 w-9">
                  <Redo2 className="h-4 w-4" />
                </Button>
              )}
              {onNext && mode === "host" && (
                <Button size="icon" variant="ghost" onClick={onNext} className="h-9 w-9">
                  <SkipForward className="h-4 w-4" />
                </Button>
              )}
              {mode === "host" && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleToggleRepeat}
                  className={cn(
                    "h-9 w-9 transition-colors",
                    playerState.repeat !== "off" && "bg-primary/20 text-primary hover:bg-primary/30",
                  )}
                >
                  {playerState.repeat === "one" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>

          {/* Bottom row: Progress slider with time stamps */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
              {formatTime(playerState.currentTime)}
            </span>
            <div ref={progressSliderRef} className="flex-1 py-3">
              <Slider
                value={[playerState.currentTime]}
                max={playerState.duration || 100}
                step={0.1}
                onValueChange={handleSeek}
                onPointerDown={handleSeekStart}
                onPointerUp={handleSeekEnd}
                disabled={mode === "listener"}
              />
            </div>
            <span className="text-xs text-muted-foreground w-10 shrink-0">{formatTime(playerState.duration)}</span>

            {/* Volume - hide slider on mobile (uses device volume) */}
            <div className="flex items-center gap-2 shrink-0 ml-2" style={isMobile ? { width: "auto" } : { width: "7rem" }}>
              <Button size="icon" variant="ghost" onClick={handleToggleMute} className="h-8 w-8">
                {playerState.isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              {!isMobile && (
                <div ref={volumeSliderRef} className="flex-1 py-2">
                  <Slider
                    value={[playerState.isMuted ? 0 : playerState.volume]}
                    max={1}
                    step={0.01}
                    onValueChange={(value) => handleVolumeChange(value[0])}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        </Card>
        {/* Container for audio adapters (rendered once, outside variant conditionals) */}
        {/* The adapter will create/manage the iframe inside this container */}
        <div className="hidden">
          <div id={containerId} />
        </div>
      </>
    )
  }

  // Full player variant
  return (
    <>
      <Card
        ref={playerRef}
        tabIndex={0}
        className={cn("w-full max-w-2xl mx-auto focus:outline-none focus:ring-2 focus:ring-primary/20 relative overflow-visible", className)}
      >
        <div className="px-4 py-2 md:px-4 md:py-3 space-y-2 md:space-y-3 relative">
          {/* Track artwork and info */}
          <div className="flex items-center gap-3 md:gap-4">
            {artworkUrl && (
              <img
                key={`artwork-${displayTrack.id}`}
                src={artworkUrl}
                alt={displayTrack.title}
                className="h-20 w-20 md:h-24 md:w-24 rounded-lg object-cover shadow-lg shrink-0"
                loading="lazy"
                decoding="async"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg md:text-xl truncate">{displayTrack.title}</h3>
                  <p className="text-muted-foreground text-sm md:text-base truncate">{displayTrack.artist}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground">
                      {displayTrack.source.toUpperCase()}
                    </span>
                  </div>
                </div>
                {/* Volume control on mobile - positioned at top like mini variant */}
                {isMobile && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="icon" variant="ghost" onClick={handleToggleMute} className="h-7 w-7">
                      {playerState.isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div ref={progressSliderRef} className="py-2">
              <Slider
                value={[playerState.currentTime]}
                max={playerState.duration || 100}
                step={0.1}
                onValueChange={handleSeek}
                onPointerDown={() => {
                  setIsDragging(true)
                  handleSeekStart()
                }}
                onPointerUp={() => {
                  setIsDragging(false)
                  handleSeekEnd()
                }}
                disabled={mode === "listener"}
                className={cn("w-full", mode === "listener" && "opacity-50 cursor-not-allowed")}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatTime(playerState.currentTime)}</span>
              <span>{formatTime(playerState.duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Volume controls - hide on mobile (positioned at top), show on desktop */}
            {!isMobile && (
              <div className="flex items-center gap-2 w-full md:w-auto">
                <Button size="icon" variant="ghost" onClick={handleToggleMute} className="h-9 w-9">
                  {playerState.isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </Button>
                <div ref={volumeSliderRef} className="w-24 md:w-28 py-2">
                  <Slider
                    value={[playerState.isMuted ? 0 : playerState.volume]}
                    max={1}
                    step={0.01}
                    onValueChange={(value) => handleVolumeChange(value[0])}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {/* Main playback controls */}
            <div className="flex items-center gap-1 md:gap-2">
              {mode === "host" && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleToggleShuffle}
                  className={cn(
                    "h-9 w-9 transition-colors",
                    playerState.shuffle && "bg-primary/20 text-primary hover:bg-primary/30",
                  )}
                >
                  <Shuffle className="h-4 w-4" />
                </Button>
              )}

              {onPrevious && mode === "host" && (
                <Button size="icon" variant="ghost" onClick={onPrevious} className="h-9 w-9">
                  <SkipBack className="h-4 w-4" />
                </Button>
              )}

              {mode === "host" && (
                <Button size="icon" variant="ghost" onClick={() => handleSkipBy(-5)} className="h-9 w-9">
                  <Undo2 className="h-4 w-4" />
                </Button>
              )}

              <Button size="icon" className="h-12 w-12" onClick={handlePlayPause} disabled={playerState.isBuffering}>
                {playerState.isBuffering ? (
                  <div className="h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                ) : playerState.isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6" />
                )}
              </Button>

              {mode === "host" && (
                <Button size="icon" variant="ghost" onClick={() => handleSkipBy(5)} className="h-9 w-9">
                  <Redo2 className="h-4 w-4" />
                </Button>
              )}

              {onNext && mode === "host" && (
                <Button size="icon" variant="ghost" onClick={onNext} className="h-9 w-9">
                  <SkipForward className="h-4 w-4" />
                </Button>
              )}

              {mode === "host" && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleToggleRepeat}
                  className={cn(
                    "h-9 w-9 transition-colors",
                    playerState.repeat !== "off" && "bg-primary/20 text-primary hover:bg-primary/30",
                  )}
                >
                  {playerState.repeat === "one" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
                </Button>
              )}
            </div>

            {/* Spacer for layout balance on desktop */}
            <div className="hidden md:block w-28" />
          </div>
        </div>
          {/* GIF on the right side of the audio player, aligned with artwork */}
          {/* <div className="absolute right-10 md:right-8 top-10 md:top-6 flex items-start z-10 pointer-events-none" style={{ willChange: 'transform' }}>
            <img
              src="https://media.tenor.com/qiYC04fUus0AAAAj/rainbow-pls-bttv.gif"
              alt=""
              className="h-20 w-20 md:h-24 md:w-24 rounded-lg object-cover shrink-0"
              loading="eager"
              decoding="async"
              style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
            />
          </div> */}
      </Card>
      {/* Container for audio adapters (rendered once, outside variant conditionals) */}
      {/* The adapter will create/manage the iframe inside this container */}
      <div className="hidden">
        <div id={containerId} />
      </div>
    </>
  )


}
