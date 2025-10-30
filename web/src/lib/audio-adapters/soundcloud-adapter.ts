import type { AudioPlayerAdapter } from "@/types/audio-player"

declare global {
  interface Window {
    SC: any
  }
}

export class SoundCloudAudioAdapter implements AudioPlayerAdapter {
  private widget: any
  private containerId: string
  private timeUpdateCallback?: (time: number) => void
  private durationChangeCallback?: (duration: number) => void
  private endedCallback?: () => void
  private playCallback?: () => void
  private pauseCallback?: () => void
  private bufferingCallback?: (isBuffering: boolean) => void
  private timeUpdateInterval?: NodeJS.Timeout
  private isReady = false

  constructor(containerId = "soundcloud-player") {
    this.containerId = containerId
    this.loadSoundCloudAPI()
  }

  private loadSoundCloudAPI(): Promise<void> {
    return new Promise((resolve) => {
      if (window.SC) {
        resolve()
        return
      }

      const tag = document.createElement("script")
      tag.src = "https://w.soundcloud.com/player/api.js"
      tag.onload = () => resolve()
      document.head.appendChild(tag)
    })
  }

  async load(url: string): Promise<void> {
    await this.loadSoundCloudAPI()

    return new Promise((resolve) => {
      const iframe = document.getElementById(this.containerId) as HTMLIFrameElement
      if (!iframe) {
        console.error("SoundCloud iframe not found")
        return
      }

      iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false`

      this.widget = window.SC.Widget(iframe)

      this.widget.bind(window.SC.Widget.Events.READY, () => {
        this.isReady = true
        this.widget.getDuration((duration: number) => {
          this.durationChangeCallback?.(duration / 1000)
        })
        this.startTimeUpdateInterval()
        resolve()
      })

      this.widget.bind(window.SC.Widget.Events.PLAY, () => {
        this.playCallback?.()
        this.bufferingCallback?.(false)
      })

      this.widget.bind(window.SC.Widget.Events.PAUSE, () => {
        this.pauseCallback?.()
      })

      this.widget.bind(window.SC.Widget.Events.FINISH, () => {
        this.endedCallback?.()
      })

      this.widget.bind(window.SC.Widget.Events.PLAY_PROGRESS, () => {
        this.bufferingCallback?.(false)
      })
    })
  }

  private startTimeUpdateInterval() {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval)
    }
    this.timeUpdateInterval = setInterval(() => {
      if (this.widget && this.isReady) {
        this.widget.getPosition((position: number) => {
          this.timeUpdateCallback?.(position / 1000)
        })
      }
    }, 100)
  }

  async play(): Promise<void> {
    if (this.widget && this.isReady) {
      this.widget.play()
    }
  }

  pause(): void {
    if (this.widget && this.isReady) {
      this.widget.pause()
    }
  }

  seek(time: number): void {
    if (this.widget && this.isReady) {
      this.widget.seekTo(time * 1000)
    }
  }

  setVolume(volume: number): void {
    if (this.widget && this.isReady) {
      this.widget.setVolume(volume * 100)
    }
  }

  mute(): void {
    if (this.widget && this.isReady) {
      this.widget.setVolume(0)
    }
  }

  unmute(): void {
    if (this.widget && this.isReady) {
      this.widget.setVolume(100)
    }
  }

  getCurrentTime(): number {
    return 0 // Updated via interval
  }

  getDuration(): number {
    return 0 // Updated via callback
  }

  destroy(): void {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval)
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
