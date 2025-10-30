"use client"

import { useAudioPlayer } from "@/hooks/use-audio-player"
import type { Track, PlayerMode, PlayerVariant, ScrollControlOptions } from "@/types/audio-player"
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
import { useEffect, useState, useRef } from "react"
import { cn } from "@/lib/utils"

interface AudioPlayerProps {
  track: Track | null
  mode?: PlayerMode
  variant?: PlayerVariant
  onTrackEnd?: () => void
  onTimeSync?: (time: number) => void
  liveTime?: number
  className?: string
  onNext?: () => void
  onPrevious?: () => void
  scrollControls?: ScrollControlOptions
  onPlayerReady?: (controls: PlayerControls) => void
}

export interface PlayerControls {
  play: () => void
  pause: () => void
  seek: (time: number) => void
  skipForward: (seconds: number) => void
  skipBackward: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  getState: () => any
}

export function AudioPlayer({
  track,
  mode = "host",
  variant = "full",
  onTrackEnd,
  onTimeSync,
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
  const playerRef = useRef<HTMLDivElement>(null)
  const volumeSliderRef = useRef<HTMLDivElement>(null)
  const progressSliderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (onPlayerReady) {
      onPlayerReady({
        play,
        pause,
        seek,
        skipForward,
        skipBackward,
        setVolume,
        toggleMute,
        toggleShuffle,
        toggleRepeat,
        getState: () => playerState,
      })
    }
  }, [
    onPlayerReady,
    play,
    pause,
    seek,
    skipForward,
    skipBackward,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    playerState,
  ])

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as Node

      // Check if hovering over progress slider for track seeking (with larger hitbox)
      if (progressSliderRef.current?.contains(target)) {
        if (scrollControls.enableTrackControl && mode === "host") {
          e.preventDefault()
          const seekAmount = e.deltaY > 0 ? -5 : 5
          const newTime = Math.max(0, Math.min(playerState.duration, playerState.currentTime + seekAmount))
          seek(newTime)
        }
      }
      // Check if hovering over volume slider for volume control (with larger hitbox)
      else if (volumeSliderRef.current?.contains(target)) {
        if (scrollControls.enableVolumeControl) {
          e.preventDefault()
          const volumeChange = e.deltaY > 0 ? -0.05 : 0.05
          const newVolume = Math.max(0, Math.min(1, playerState.volume + volumeChange))
          setVolume(newVolume)
        }
      }
    }

    const element = playerRef.current
    if (element) {
      element.addEventListener("wheel", handleWheel, { passive: false })
      return () => element.removeEventListener("wheel", handleWheel)
    }
  }, [scrollControls, mode, playerState.currentTime, playerState.duration, playerState.volume, seek, setVolume])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if the player or its children are focused
      if (playerRef.current?.contains(document.activeElement) && mode === "host") {
        if (e.key === "ArrowLeft") {
          e.preventDefault()
          skipBackward(5)
        } else if (e.key === "ArrowRight") {
          e.preventDefault()
          skipForward(5)
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [mode, skipBackward, skipForward])

  useEffect(() => {
    if (track && track.id !== currentTrack?.id) {
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
      seek(value[0])
    }
  }

  const handlePlayPause = () => {
    if (playerState.isPlaying) {
      pause()
    } else {
      play()
    }
  }

  if (!track) {
    return null
  }

  // Mini player variant
  if (variant === "mini") {
    return (
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
            {track.artwork && (
              <img
                src={track.artwork || "/placeholder.svg"}
                alt={track.title}
                className="h-9 w-9 rounded object-cover shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{track.title}</p>
              <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
            </div>
            {/* Volume control in top right */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="icon" variant="ghost" onClick={toggleMute} className="h-7 w-7">
                {playerState.isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </Button>
              <div ref={volumeSliderRef} className="w-16 py-2">
                <Slider
                  value={[playerState.isMuted ? 0 : playerState.volume]}
                  max={1}
                  step={0.01}
                  onValueChange={(value) => setVolume(value[0])}
                />
              </div>
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
                disabled={mode === "listener"}
              />
            </div>
            <span className="text-xs text-muted-foreground w-9 shrink-0">{formatTime(playerState.duration)}</span>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-0 justify-center">
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleShuffle}
              className={cn(
                "h-8 w-8 transition-colors",
                playerState.shuffle && "bg-primary/20 text-primary hover:bg-primary/30",
              )}
            >
              <Shuffle className="h-3.5 w-3.5" />
            </Button>
            {onPrevious && (
              <Button size="icon" variant="ghost" onClick={onPrevious} className="h-8 w-8">
                <SkipBack className="h-3.5 w-3.5" />
              </Button>
            )}
            {mode === "host" && (
              <Button size="icon" variant="ghost" onClick={() => skipBackward(5)} className="h-8 w-8">
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="icon" onClick={handlePlayPause} className="h-9 w-9 mx-1">
              {playerState.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            {mode === "host" && (
              <Button size="icon" variant="ghost" onClick={() => skipForward(5)} className="h-8 w-8">
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {onNext && (
              <Button size="icon" variant="ghost" onClick={onNext} className="h-8 w-8">
                <SkipForward className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleRepeat}
              className={cn(
                "h-8 w-8 transition-colors",
                playerState.repeat !== "off" && "bg-primary/20 text-primary hover:bg-primary/30",
              )}
            >
              {playerState.repeat === "one" ? <Repeat1 className="h-3.5 w-3.5" /> : <Repeat className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Desktop layout */}
        <div className="hidden md:flex flex-col gap-1.5 p-3">
          {/* Top row: Track info and main controls */}
          <div className="flex items-center gap-3">
            {/* Track info */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {track.artwork && (
                <img
                  src={track.artwork || "/placeholder.svg"}
                  alt={track.title}
                  className="h-14 w-14 rounded object-cover shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-base truncate">{track.title}</p>
                <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
              </div>
            </div>

            {/* Desktop controls */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleShuffle}
                className={cn(
                  "h-9 w-9 transition-colors",
                  playerState.shuffle && "bg-primary/20 text-primary hover:bg-primary/30",
                )}
              >
                <Shuffle className="h-4 w-4" />
              </Button>
              {onPrevious && (
                <Button size="icon" variant="ghost" onClick={onPrevious} className="h-9 w-9">
                  <SkipBack className="h-4 w-4" />
                </Button>
              )}
              {mode === "host" && (
                <Button size="icon" variant="ghost" onClick={() => skipBackward(5)} className="h-9 w-9">
                  <Undo2 className="h-4 w-4" />
                </Button>
              )}
              <Button size="icon" onClick={handlePlayPause} className="h-10 w-10">
                {playerState.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>
              {mode === "host" && (
                <Button size="icon" variant="ghost" onClick={() => skipForward(5)} className="h-9 w-9">
                  <Redo2 className="h-4 w-4" />
                </Button>
              )}
              {onNext && (
                <Button size="icon" variant="ghost" onClick={onNext} className="h-9 w-9">
                  <SkipForward className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleRepeat}
                className={cn(
                  "h-9 w-9 transition-colors",
                  playerState.repeat !== "off" && "bg-primary/20 text-primary hover:bg-primary/30",
                )}
              >
                {playerState.repeat === "one" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
              </Button>
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
                disabled={mode === "listener"}
              />
            </div>
            <span className="text-xs text-muted-foreground w-10 shrink-0">{formatTime(playerState.duration)}</span>

            {/* Volume */}
            <div className="flex items-center gap-2 w-28 shrink-0 ml-2">
              <Button size="icon" variant="ghost" onClick={toggleMute} className="h-8 w-8">
                {playerState.isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <div ref={volumeSliderRef} className="flex-1 py-2">
                <Slider
                  value={[playerState.isMuted ? 0 : playerState.volume]}
                  max={1}
                  step={0.01}
                  onValueChange={(value) => setVolume(value[0])}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Hidden iframes for YouTube/SoundCloud */}
        <div className="hidden">
          <div id={containerId} />
          <iframe id={containerId} title="Audio Player" />
        </div>
      </Card>
    )
  }

  // Full player variant
  return (
    <Card
      ref={playerRef}
      tabIndex={0}
      className={cn("w-full max-w-2xl mx-auto focus:outline-none focus:ring-2 focus:ring-primary/20", className)}
    >
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Track artwork and info */}
        <div className="flex items-center gap-3 md:gap-4">
          {track.artwork && (
            <img
              src={track.artwork || "/placeholder.svg"}
              alt={track.title}
              className="h-20 w-20 md:h-24 md:w-24 rounded-lg object-cover shadow-lg shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg md:text-xl truncate">{track.title}</h3>
            <p className="text-muted-foreground text-sm md:text-base truncate">{track.artist}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground">
                {track.source.toUpperCase()}
              </span>
              {mode === "listener" && (
                <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">Listener Mode</span>
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
              onPointerDown={() => setIsDragging(true)}
              onPointerUp={() => setIsDragging(false)}
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
          {/* Volume controls */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Button size="icon" variant="ghost" onClick={toggleMute} className="h-9 w-9">
              {playerState.isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>
            <div ref={volumeSliderRef} className="w-24 md:w-28 py-2">
              <Slider
                value={[playerState.isMuted ? 0 : playerState.volume]}
                max={1}
                step={0.01}
                onValueChange={(value) => setVolume(value[0])}
                className="w-full"
              />
            </div>
          </div>

          {/* Main playback controls */}
          <div className="flex items-center gap-1 md:gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleShuffle}
              className={cn(
                "h-9 w-9 transition-colors",
                playerState.shuffle && "bg-primary/20 text-primary hover:bg-primary/30",
              )}
            >
              <Shuffle className="h-4 w-4" />
            </Button>

            {onPrevious && (
              <Button size="icon" variant="ghost" onClick={onPrevious} className="h-9 w-9">
                <SkipBack className="h-4 w-4" />
              </Button>
            )}

            {mode === "host" && (
              <Button size="icon" variant="ghost" onClick={() => skipBackward(5)} className="h-9 w-9">
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
              <Button size="icon" variant="ghost" onClick={() => skipForward(5)} className="h-9 w-9">
                <Redo2 className="h-4 w-4" />
              </Button>
            )}

            {onNext && (
              <Button size="icon" variant="ghost" onClick={onNext} className="h-9 w-9">
                <SkipForward className="h-4 w-4" />
              </Button>
            )}

            <Button
              size="icon"
              variant="ghost"
              onClick={toggleRepeat}
              className={cn(
                "h-9 w-9 transition-colors",
                playerState.repeat !== "off" && "bg-primary/20 text-primary hover:bg-primary/30",
              )}
            >
              {playerState.repeat === "one" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
            </Button>
          </div>

          {/* Spacer for layout balance on desktop */}
          <div className="hidden md:block w-28" />
        </div>
      </div>

      {/* Hidden iframes for YouTube/SoundCloud */}
      <div className="hidden">
        <div id={containerId} />
        <iframe id={containerId} title="Audio Player" />
      </div>
    </Card>
  )
}
