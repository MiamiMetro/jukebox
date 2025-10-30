export type AudioSource = "html5" | "youtube" | "soundcloud" | "howler"

export type PlayerMode = "host" | "listener"

export type PlayerVariant = "full" | "mini"

export type RepeatMode = "off" | "one" | "all"

export interface ScrollControlOptions {
  enableVolumeControl?: boolean // Scroll to adjust volume
  enableTrackControl?: boolean // Shift+Scroll to seek through track
}

export interface Track {
  id: string
  title: string
  artist: string
  artwork?: string
  source: AudioSource
  url: string
  duration?: number
}

export interface PlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  isBuffering: boolean
  isLive: boolean // For listener mode - whether synced to live position
  shuffle: boolean
  repeat: RepeatMode
}

export interface AudioPlayerAdapter {
  load(url: string): Promise<void>
  play(): Promise<void>
  pause(): void
  seek(time: number): void
  setVolume(volume: number): void
  mute(): void
  unmute(): void
  getCurrentTime(): number
  getDuration(): number
  destroy(): void
  onTimeUpdate(callback: (time: number) => void): void
  onDurationChange(callback: (duration: number) => void): void
  onEnded(callback: () => void): void
  onPlay(callback: () => void): void
  onPause(callback: () => void): void
  onBuffering(callback: (isBuffering: boolean) => void): void
}
