import type { AudioPlayerAdapter } from "@/types/audio-player"

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady: () => void
  }
}

export class YouTubeAudioAdapter implements AudioPlayerAdapter {
  private player: any
  private containerId: string
  private timeUpdateCallback?: (time: number) => void
  private durationChangeCallback?: (duration: number) => void
  private endedCallback?: () => void
  private playCallback?: () => void
  private pauseCallback?: () => void
  private bufferingCallback?: (isBuffering: boolean) => void
  private timeUpdateInterval?: NodeJS.Timeout
  private isReady = false

  constructor(containerId = "youtube-player") {
    this.containerId = containerId
    this.loadYouTubeAPI()
  }

  private loadYouTubeAPI(): Promise<void> {
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        resolve()
        return
      }

      const tag = document.createElement("script")
      tag.src = "https://www.youtube.com/iframe_api"
      const firstScriptTag = document.getElementsByTagName("script")[0]
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)

      window.onYouTubeIframeAPIReady = () => {
        resolve()
      }
    })
  }

  private extractVideoId(url: string): string {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/
    const match = url.match(regExp)
    return match && match[7].length === 11 ? match[7] : url
  }

  async load(url: string): Promise<void> {
    await this.loadYouTubeAPI()
    const videoId = this.extractVideoId(url)

    return new Promise((resolve) => {
      if (this.player) {
        this.player.loadVideoById(videoId)
        resolve()
        return
      }

      this.player = new window.YT.Player(this.containerId, {
        height: "0",
        width: "0",
        videoId: videoId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
        },
        events: {
          onReady: () => {
            this.isReady = true
            this.durationChangeCallback?.(this.player.getDuration())
            this.startTimeUpdateInterval()
            resolve()
          },
          onStateChange: (event: any) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              this.playCallback?.()
              this.bufferingCallback?.(false)
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              this.pauseCallback?.()
            } else if (event.data === window.YT.PlayerState.ENDED) {
              this.endedCallback?.()
            } else if (event.data === window.YT.PlayerState.BUFFERING) {
              this.bufferingCallback?.(true)
            }
          },
        },
      })
    })
  }

  private startTimeUpdateInterval() {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval)
    }
    this.timeUpdateInterval = setInterval(() => {
      if (this.player && this.isReady) {
        this.timeUpdateCallback?.(this.player.getCurrentTime())
      }
    }, 100)
  }

  async play(): Promise<void> {
    if (this.player && this.isReady) {
      this.player.playVideo()
    }
  }

  pause(): void {
    if (this.player && this.isReady) {
      this.player.pauseVideo()
    }
  }

  seek(time: number): void {
    if (this.player && this.isReady) {
      this.player.seekTo(time, true)
    }
  }

  setVolume(volume: number): void {
    if (this.player && this.isReady) {
      this.player.setVolume(volume * 100)
    }
  }

  mute(): void {
    if (this.player && this.isReady) {
      this.player.mute()
    }
  }

  unmute(): void {
    if (this.player && this.isReady) {
      this.player.unMute()
    }
  }

  getCurrentTime(): number {
    return this.player && this.isReady ? this.player.getCurrentTime() : 0
  }

  getDuration(): number {
    return this.player && this.isReady ? this.player.getDuration() : 0
  }

  destroy(): void {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval)
    }
    if (this.player) {
      this.player.destroy()
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
