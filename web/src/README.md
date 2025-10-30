# Unified Audio Player

A modern, professional, and mobile-compatible audio player component for real-time online jukeboxes. Supports multiple audio sources (HTML5, YouTube, SoundCloud) with a unified API and easy extensibility.

## Features

- **Multiple Audio Sources**: HTML5 audio, YouTube, SoundCloud (easily extensible)
- **Unified API**: Single interface for all audio sources
- **Host/Listener Modes**: Full control for hosts, live sync for listeners
- **Two Variants**: Full player and mini player (Spotify-style)
- **Mobile-First**: Responsive design with excellent mobile UX
- **Programmatic Control**: Complete API for play, pause, seek, skip, volume
- **Scroll Wheel Controls**: Volume control and optional track seeking via scroll wheel
- **Modern UI**: Smooth controls with shuffle, repeat, and skip buttons
- **Reusable**: Easy to integrate and customize

## Quick Start

\`\`\`tsx
import { AudioPlayer } from "@/components/audio-player"
import type { Track } from "@/types/audio-player"

const track: Track = {
  id: "1",
  title: "My Song",
  artist: "Artist Name",
  source: "html5",
  url: "https://example.com/audio.mp3",
  artwork: "/artwork.jpg"
}

function MyApp() {
  return (
    <AudioPlayer
      track={track}
      mode="host"
      variant="full"
      onNext={() => console.log("Next track")}
      onPrevious={() => console.log("Previous track")}
    />
  )
}
\`\`\`

## API Reference

### AudioPlayer Component

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `track` | `Track \| null` | - | Current track to play |
| `mode` | `"host" \| "listener"` | `"host"` | Player mode |
| `variant` | `"full" \| "mini"` | `"full"` | Player variant |
| `onTrackEnd` | `() => void` | - | Called when track ends |
| `onTimeSync` | `(time: number) => void` | - | Called on time updates (for syncing) |
| `liveTime` | `number` | `0` | Current live time from server (listener mode) |
| `onNext` | `() => void` | - | Called when next button clicked |
| `onPrevious` | `() => void` | - | Called when previous button clicked |
| `scrollControls` | `ScrollControlOptions` | `{ enableVolumeControl: true, enableTrackControl: true }` | Scroll wheel control options |
| `onPlayerReady` | `(controls: PlayerControls) => void` | - | Called when player is ready with programmatic controls |
| `className` | `string` | - | Additional CSS classes |

#### Scroll Control Options

\`\`\`typescript
interface ScrollControlOptions {
  enableVolumeControl?: boolean  // Scroll to adjust volume (default: true)
  enableTrackControl?: boolean   // Shift+Scroll to seek through track (default: true)
}
\`\`\`

**Usage:**
- **Volume Control**: Scroll up/down over the player to adjust volume
- **Track Seeking**: Hold Shift and scroll up/down to seek forward/backward (host mode only)

#### Programmatic Control

Use the `onPlayerReady` callback to get full programmatic control:

\`\`\`tsx
import type { PlayerControls } from "@/components/audio-player"

function MyApp() {
  const [controls, setControls] = useState<PlayerControls | null>(null)

  return (
    <>
      <AudioPlayer
        track={track}
        onPlayerReady={(playerControls) => setControls(playerControls)}
      />
      
      {/* Control the player from anywhere */}
      <button onClick={() => controls?.play()}>Play</button>
      <button onClick={() => controls?.pause()}>Pause</button>
      <button onClick={() => controls?.seek(30)}>Seek to 30s</button>
      <button onClick={() => controls?.skipForward(10)}>+10s</button>
      <button onClick={() => controls?.setVolume(0.5)}>50% Volume</button>
    </>
  )
}
\`\`\`

#### PlayerControls Interface

\`\`\`typescript
interface PlayerControls {
  play: () => void
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
\`\`\`

#### Track Object

\`\`\`typescript
interface Track {
  id: string              // Unique identifier
  title: string           // Track title
  artist: string          // Artist name
  artwork?: string        // Artwork URL
  source: AudioSource     // "html5" | "youtube" | "soundcloud" | "howler"
  url: string            // Audio source URL
  duration?: number      // Optional duration in seconds
}
\`\`\`

### useAudioPlayer Hook

For advanced use cases, you can use the hook directly:

\`\`\`tsx
import { useAudioPlayer } from "@/hooks/use-audio-player"

function CustomPlayer() {
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
  } = useAudioPlayer({
    mode: "host",
    onTrackEnd: () => console.log("Track ended"),
    onTimeSync: (time) => console.log("Current time:", time),
  })

  // Use the API methods and state
  return (
    <div>
      <button onClick={play}>Play</button>
      <button onClick={pause}>Pause</button>
      <button onClick={() => skipForward(5)}>+5s</button>
      <button onClick={() => skipBackward(5)}>-5s</button>
      <p>Playing: {playerState.isPlaying ? "Yes" : "No"}</p>
      <p>Time: {playerState.currentTime} / {playerState.duration}</p>
    </div>
  )
}
\`\`\`

#### Hook API Methods

| Method | Parameters | Description |
|--------|------------|-------------|
| `loadTrack` | `(track: Track)` | Load a new track |
| `play` | `()` | Play current track |
| `pause` | `()` | Pause current track |
| `seek` | `(time: number)` | Seek to specific time (host mode only) |
| `skipForward` | `(seconds?: number)` | Skip forward (default: 5s) |
| `skipBackward` | `(seconds?: number)` | Skip backward (default: 5s) |
| `setVolume` | `(volume: number)` | Set volume (0-1) |
| `toggleMute` | `()` | Toggle mute |
| `toggleShuffle` | `()` | Toggle shuffle mode |
| `toggleRepeat` | `()` | Cycle repeat mode (off → all → one) |

#### Player State

\`\`\`typescript
interface PlayerState {
  isPlaying: boolean      // Currently playing
  currentTime: number     // Current playback time
  duration: number        // Total duration
  volume: number          // Volume level (0-1)
  isMuted: boolean        // Muted state
  isBuffering: boolean    // Buffering state
  isLive: boolean         // Live sync state (listener mode)
  shuffle: boolean        // Shuffle enabled
  repeat: RepeatMode      // "off" | "all" | "one"
}
\`\`\`

## Creating Custom Adapters

The player uses an adapter pattern to support different audio sources. Here's how to create your own adapter:

### 1. Implement the AudioPlayerAdapter Interface

\`\`\`typescript
import type { AudioPlayerAdapter } from "@/types/audio-player"

export class MyCustomAdapter implements AudioPlayerAdapter {
  private timeUpdateCallback?: (time: number) => void
  private durationChangeCallback?: (duration: number) => void
  private endedCallback?: () => void
  private playCallback?: () => void
  private pauseCallback?: () => void
  private bufferingCallback?: (isBuffering: boolean) => void

  constructor(containerId?: string) {
    // Initialize your audio player
    // containerId is useful for iframe-based players
  }

  async load(url: string): Promise<void> {
    // Load the audio from URL
    // Call this.durationChangeCallback when duration is known
  }

  async play(): Promise<void> {
    // Start playback
    // Call this.playCallback when playing starts
  }

  pause(): void {
    // Pause playback
    // Call this.pauseCallback when paused
  }

  seek(time: number): void {
    // Seek to specific time
  }

  setVolume(volume: number): void {
    // Set volume (0-1)
  }

  mute(): void {
    // Mute audio
  }

  unmute(): void {
    // Unmute audio
  }

  getCurrentTime(): number {
    // Return current playback time
    return 0
  }

  getDuration(): number {
    // Return total duration
    return 0
  }

  destroy(): void {
    // Clean up resources
  }

  // Event listener setters
  onTimeUpdate(callback: (time: number) => void): void {
    this.timeUpdateCallback = callback
  }

  onDurationChange(callback: (duration: number) => void): void {
    this.durationChangeCallback = callback
  }

  onEnded(callback: () => void): void {
    this.endedCallback = callback
  }

  onPlay(callback: () => void): void {
    this.playCallback = callback
  }

  onPause(callback: () => void): void {
    this.pauseCallback = callback
  }

  onBuffering(callback: (isBuffering: boolean) => void): void {
    this.bufferingCallback = callback
  }
}
\`\`\`

### 2. Register Your Adapter

Add your adapter to the factory:

\`\`\`typescript
// lib/audio-adapters/adapter-factory.ts
import { MyCustomAdapter } from "./my-custom-adapter"

export class AudioAdapterFactory {
  static createAdapter(source: AudioSource, containerId?: string): AudioPlayerAdapter {
    switch (source) {
      case "html5":
        return new HTML5AudioAdapter()
      case "youtube":
        return new YouTubeAdapter(containerId)
      case "soundcloud":
        return new SoundCloudAdapter(containerId)
      case "mycustom": // Add your custom source
        return new MyCustomAdapter(containerId)
      default:
        return new HTML5AudioAdapter()
    }
  }
}
\`\`\`

### 3. Update the AudioSource Type

\`\`\`typescript
// types/audio-player.ts
export type AudioSource = "html5" | "youtube" | "soundcloud" | "mycustom"
\`\`\`

### 4. Use Your Custom Adapter

\`\`\`tsx
const track: Track = {
  id: "1",
  title: "Custom Track",
  artist: "Artist",
  source: "mycustom",
  url: "https://example.com/custom-audio",
}

<AudioPlayer track={track} />
\`\`\`

## Example: Howler.js Adapter

Here's a complete example of creating a Howler.js adapter:

\`\`\`typescript
import { Howl } from "howler"
import type { AudioPlayerAdapter } from "@/types/audio-player"

export class HowlerAdapter implements AudioPlayerAdapter {
  private howl: Howl | null = null
  private timeUpdateCallback?: (time: number) => void
  private durationChangeCallback?: (duration: number) => void
  private endedCallback?: () => void
  private playCallback?: () => void
  private pauseCallback?: () => void
  private bufferingCallback?: (isBuffering: boolean) => void
  private timeUpdateInterval?: NodeJS.Timeout

  async load(url: string): Promise<void> {
    if (this.howl) {
      this.howl.unload()
    }

    return new Promise((resolve) => {
      this.howl = new Howl({
        src: [url],
        html5: true,
        onload: () => {
          this.durationChangeCallback?.(this.howl!.duration())
          resolve()
        },
        onplay: () => {
          this.playCallback?.()
          this.startTimeUpdate()
        },
        onpause: () => {
          this.pauseCallback?.()
          this.stopTimeUpdate()
        },
        onend: () => {
          this.endedCallback?.()
          this.stopTimeUpdate()
        },
      })
    })
  }

  async play(): Promise<void> {
    this.howl?.play()
  }

  pause(): void {
    this.howl?.pause()
  }

  seek(time: number): void {
    this.howl?.seek(time)
  }

  setVolume(volume: number): void {
    this.howl?.volume(volume)
  }

  mute(): void {
    this.howl?.mute(true)
  }

  unmute(): void {
    this.howl?.mute(false)
  }

  getCurrentTime(): number {
    return (this.howl?.seek() as number) || 0
  }

  getDuration(): number {
    return this.howl?.duration() || 0
  }

  destroy(): void {
    this.stopTimeUpdate()
    this.howl?.unload()
    this.howl = null
  }

  private startTimeUpdate(): void {
    this.stopTimeUpdate()
    this.timeUpdateInterval = setInterval(() => {
      this.timeUpdateCallback?.(this.getCurrentTime())
    }, 100)
  }

  private stopTimeUpdate(): void {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval)
      this.timeUpdateInterval = undefined
    }
  }

  onTimeUpdate(callback: (time: number) => void): void {
    this.timeUpdateCallback = callback
  }

  onDurationChange(callback: (duration: number) => void): void {
    this.durationChangeCallback = callback
  }

  onEnded(callback: () => void): void {
    this.endedCallback = callback
  }

  onPlay(callback: () => void): void {
    this.playCallback = callback
  }

  onPause(callback: () => void): void {
    this.pauseCallback = callback
  }

  onBuffering(callback: (isBuffering: boolean) => void): void {
    this.bufferingCallback = callback
  }
}
\`\`\`

## Host vs Listener Mode

### Host Mode
- Full control over playback
- Can seek anywhere in the track
- Controls shuffle and repeat
- Skip forward/backward buttons enabled (+5s/-5s)
- Scroll wheel controls available

### Listener Mode
- Automatically syncs to live playback when playing
- Cannot seek (slider disabled)
- Pausing stops live sync
- Playing automatically resumes live sync (no "Go Live" button needed)
- No skip buttons (follows host's playback)
- Scroll wheel volume control still available

## Control Buttons

Both full and mini player variants include all control buttons:

- **Play/Pause**: Main playback control
- **Skip Back/Forward**: Navigate between tracks (when callbacks provided)
- **-5s/+5s**: Skip backward/forward 5 seconds (host mode only, uses Undo2/Redo2 icons)
- **Shuffle**: Toggle shuffle mode
- **Repeat**: Cycle through off → all → one
- **Volume**: Mute/unmute and volume slider

All buttons are fully accessible on mobile with optimized touch targets and responsive layouts.

## Scroll Wheel Controls

The player supports intuitive scroll wheel controls:

### Volume Control (Default: Enabled)
- **Scroll up**: Increase volume
- **Scroll down**: Decrease volume
- Works in both host and listener modes
- Smooth volume adjustments in 5% increments

### Track Seeking (Default: Enabled, Host Mode Only)
- **Shift + Scroll up**: Skip forward 5 seconds
- **Shift + Scroll down**: Skip backward 5 seconds
- Only available in host mode
- Respects track boundaries

### Disabling Scroll Controls

\`\`\`tsx
<AudioPlayer
  track={track}
  scrollControls={{
    enableVolumeControl: false,  // Disable volume scroll
    enableTrackControl: false,   // Disable seek scroll
  }}
/>
\`\`\`

## Architecture

\`\`\`
┌─────────────────────────────────────┐
│     AudioPlayer Component           │
│  (UI Layer - Full/Mini variants)    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│     useAudioPlayer Hook             │
│  (State Management & Logic)         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   AudioAdapterFactory                │
│  (Creates appropriate adapter)       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   AudioPlayerAdapter Interface       │
│  (Unified API for all sources)       │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┬───────────┐
       ▼               ▼           ▼
┌──────────┐   ┌──────────┐   ┌──────────┐
│  HTML5   │   │ YouTube  │   │SoundCloud│
│ Adapter  │   │ Adapter  │   │ Adapter  │
└──────────┘   └──────────┘   └──────────┘
\`\`\`

## Mobile Optimization

The player is fully optimized for mobile with excellent UX:

- **Touch-friendly controls**: All buttons have appropriate touch targets (minimum 44x44px)
- **Responsive layouts**: Adapts seamlessly to all screen sizes
- **All controls on mobile**: Mini player includes all buttons (shuffle, repeat, skip, etc.)
- **Compact mobile layout**: Efficient use of space without sacrificing functionality
- **Smooth animations**: Hardware-accelerated transitions
- **Optimized for both orientations**: Works great in portrait and landscape
- **Accessible progress bar**: Easy to seek on mobile with large touch area

### Mini Player Mobile Layout

The mini player on mobile features a two-row layout:
1. **Top row**: Track info + all control buttons in a compact arrangement
2. **Bottom row**: Time stamps + seekable progress slider + volume (desktop only)

All buttons remain accessible and functional on mobile devices.

## Best Practices

1. **Always load tracks before playing**: Use the `loadTrack` method or pass a new track to the component
2. **Handle track changes**: The component automatically handles track changes when the track ID changes
3. **Implement onNext/onPrevious**: For playlist functionality, implement these callbacks
4. **Use listener mode for real-time sync**: Perfect for live streaming or synchronized playback
5. **Leverage programmatic control**: Use `onPlayerReady` to control the player from anywhere in your app
6. **Customize scroll controls**: Disable scroll controls if they conflict with your UI
7. **Clean up resources**: The player automatically cleans up when unmounted

## Complete Example

\`\`\`tsx
import { useState } from "react"
import { AudioPlayer, type PlayerControls } from "@/components/audio-player"
import type { Track } from "@/types/audio-player"

function JukeboxApp() {
  const [currentTrack, setCurrentTrack] = useState<Track>({
    id: "1",
    title: "Summer Vibes",
    artist: "Cool Artist",
    source: "html5",
    url: "https://example.com/audio.mp3",
    artwork: "/artwork.jpg",
  })
  
  const [controls, setControls] = useState<PlayerControls | null>(null)
  const [mode, setMode] = useState<"host" | "listener">("host")

  const handleNext = () => {
    // Load next track logic
    console.log("Next track")
  }

  const handlePrevious = () => {
    // Load previous track logic
    console.log("Previous track")
  }

  return (
    <div>
      {/* Mode switcher */}
      <button onClick={() => setMode(mode === "host" ? "listener" : "host")}>
        Switch to {mode === "host" ? "Listener" : "Host"} Mode
      </button>

      {/* Audio player */}
      <AudioPlayer
        track={currentTrack}
        mode={mode}
        variant="mini"
        onNext={handleNext}
        onPrevious={handlePrevious}
        onPlayerReady={setControls}
        scrollControls={{
          enableVolumeControl: true,
          enableTrackControl: true,
        }}
      />

      {/* External controls */}
      <div>
        <button onClick={() => controls?.play()}>Play</button>
        <button onClick={() => controls?.pause()}>Pause</button>
        <button onClick={() => controls?.skipForward(10)}>+10s</button>
        <button onClick={() => controls?.setVolume(0.8)}>80% Volume</button>
      </div>
    </div>
  )
}
\`\`\`

## License

MIT
