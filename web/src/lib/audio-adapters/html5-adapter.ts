import type { AudioPlayerAdapter } from "@/types/audio-player"

export class HTML5AudioAdapter implements AudioPlayerAdapter {
  private audio: HTMLAudioElement
  private timeUpdateCallback?: (time: number) => void
  private durationChangeCallback?: (duration: number) => void
  private endedCallback?: () => void
  private playCallback?: () => void
  private pauseCallback?: () => void
  private bufferingCallback?: (isBuffering: boolean) => void

  constructor() {
    this.audio = new Audio()
    this.setupEventListeners()
  }

  private setupEventListeners() {
    this.audio.addEventListener("timeupdate", () => {
      this.timeUpdateCallback?.(this.audio.currentTime)
    })

    this.audio.addEventListener("durationchange", () => {
      this.durationChangeCallback?.(this.audio.duration)
    })

    this.audio.addEventListener("ended", () => {
      this.endedCallback?.()
    })

    this.audio.addEventListener("play", () => {
      this.playCallback?.()
    })

    this.audio.addEventListener("pause", () => {
      this.pauseCallback?.()
    })

    this.audio.addEventListener("waiting", () => {
      this.bufferingCallback?.(true)
    })

    this.audio.addEventListener("canplay", () => {
      this.bufferingCallback?.(false)
    })
  }

  async load(url: string): Promise<void> {
    this.audio.src = url
    this.audio.load()
    return new Promise((resolve) => {
      this.audio.addEventListener("loadedmetadata", () => resolve(), { once: true })
    })
  }

  async play(): Promise<void> {
    // Check if audio has a source and is ready before playing
    if (this.audio.src && this.audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      try {
        await this.audio.play()
      } catch (error) {
        // Silently handle play errors (audio not ready, source not loaded, etc.)
        console.debug("Play failed:", error)
      }
    }
  }

  pause(): void {
    // Check if audio has a source before pausing (safe to call even without source)
    if (this.audio.src) {
      try {
        this.audio.pause()
      } catch (error) {
        // Silently handle pause errors
        console.debug("Pause failed:", error)
      }
    }
  }

  seek(time: number): void {
    if (Number.isFinite(time) && time >= 0) {
      // Check if audio has a source and is ready
      if (this.audio.src && this.audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        try {
          this.audio.currentTime = time
        } catch (error) {
          // Silently handle seek errors (audio not ready, source not loaded, etc.)
          console.debug("Seek failed:", error)
        }
      }
    }
  }

  setVolume(volume: number): void {
    this.audio.volume = Math.max(0, Math.min(1, volume))
  }

  mute(): void {
    this.audio.muted = true
  }

  unmute(): void {
    this.audio.muted = false
  }

  getCurrentTime(): number {
    return this.audio.currentTime
  }

  getDuration(): number {
    return this.audio.duration || 0
  }

  destroy(): void {
    this.audio.pause()
    this.audio.src = ""
    this.audio.load()
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
