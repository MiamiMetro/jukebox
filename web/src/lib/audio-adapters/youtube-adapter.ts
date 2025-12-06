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
  private timeUpdateInterval?: ReturnType<typeof setInterval>
  private isReady = false
  private isLoadingNewVideo = false
  private loadVideoResolve?: () => void

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
    // If it's already a valid 11-character video ID, return it
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
      return url
    }
    
    // Try to extract from YouTube URL patterns
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/
    const match = url.match(regExp)
    if (match && match[7] && match[7].length === 11) {
      return match[7]
    }
    
    // If we can't extract a valid video ID, throw an error
    throw new Error(`Invalid YouTube URL or video ID: ${url}`)
  }

  async load(url: string): Promise<void> {
    await this.loadYouTubeAPI()
    const videoId = this.extractVideoId(url)

    return new Promise((resolve) => {
      // If player exists and is ready, use it
      if (this.player && this.isReady && typeof this.player.loadVideoById === 'function') {
        // Reset ready state - will be set to true when new video is ready
        this.isReady = false
        this.isLoadingNewVideo = true
        this.loadVideoResolve = resolve
        
        // Load the new video
        this.player.loadVideoById(videoId)
        
        // Poll for duration until video is ready (max 5 seconds)
        let attempts = 0
        const maxAttempts = 50 // 50 attempts * 100ms = 5 seconds
        const checkDuration = setInterval(() => {
          attempts++
          try {
            const duration = this.player.getDuration()
            if (duration && duration > 0 && isFinite(duration)) {
              this.isReady = true
              this.isLoadingNewVideo = false
              this.durationChangeCallback?.(duration)
              clearInterval(checkDuration)
              if (this.loadVideoResolve) {
                this.loadVideoResolve()
                this.loadVideoResolve = undefined
              }
            } else if (attempts >= maxAttempts) {
              // Timeout - resolve anyway
              this.isReady = true
              this.isLoadingNewVideo = false
              clearInterval(checkDuration)
              if (this.loadVideoResolve) {
                this.loadVideoResolve()
                this.loadVideoResolve = undefined
              }
            }
          } catch (e) {
            // Player might not be ready yet, continue polling
            if (attempts >= maxAttempts) {
              this.isReady = true
              this.isLoadingNewVideo = false
              clearInterval(checkDuration)
              if (this.loadVideoResolve) {
                this.loadVideoResolve()
                this.loadVideoResolve = undefined
              }
            }
          }
        }, 100)
        
        return
      }
      
      // If player exists but isn't ready or doesn't have the method, destroy and recreate
      if (this.player) {
        try {
          if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval)
            this.timeUpdateInterval = undefined
          }
          this.player.destroy()
        } catch (e) {
          // Ignore destroy errors
        }
        this.player = null
        this.isReady = false
      }

      // Ensure container exists and is visible (required for iOS Safari)
      let container = document.getElementById(this.containerId)
      if (!container) {
        container = document.createElement("div")
        container.id = this.containerId
        const containerEl = container as HTMLElement
        containerEl.style.position = "fixed"
        containerEl.style.top = "-1000px"
        containerEl.style.left = "-1000px"
        containerEl.style.width = "1px"
        containerEl.style.height = "1px"
        containerEl.style.opacity = "0"
        containerEl.style.pointerEvents = "none"
        containerEl.style.display = "block"
        document.body.appendChild(container)
      } else {
        // Ensure existing container is not hidden
        const containerEl = container as HTMLElement
        if (containerEl.style.display === "none") {
          containerEl.style.display = "block"
        }
      }

      this.player = new window.YT.Player(this.containerId, {
        height: "1",
        width: "1",
        videoId: videoId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1, // Required for iOS Safari
        },
        events: {
          onReady: () => {
            this.isReady = true
            this.durationChangeCallback?.(this.player.getDuration())
            this.startTimeUpdateInterval()
            resolve()
          },
          onStateChange: (event: any) => {
            const state = event.data
            console.log("YouTube state change:", state)
            if (state === window.YT.PlayerState.PLAYING) {
              this.playCallback?.()
              this.bufferingCallback?.(false)
            } else if (state === window.YT.PlayerState.PAUSED) {
              this.pauseCallback?.()
              this.bufferingCallback?.(false)
            } else if (state === window.YT.PlayerState.ENDED) {
              this.endedCallback?.()
              this.bufferingCallback?.(false)
            } else if (state === window.YT.PlayerState.BUFFERING) {
              this.bufferingCallback?.(true)
            } else if (state === window.YT.PlayerState.CUED || state === window.YT.PlayerState.UNSTARTED) {
              // Video is cued and ready to play - clear buffering
              this.bufferingCallback?.(false)
              
              // If we're loading a new video, update duration when it's ready
              if (this.isLoadingNewVideo && this.player) {
                try {
                  const duration = this.player.getDuration()
                  if (duration && duration > 0 && isFinite(duration)) {
                    this.isReady = true
                    this.isLoadingNewVideo = false
                    this.durationChangeCallback?.(duration)
                    if (this.loadVideoResolve) {
                      this.loadVideoResolve()
                      this.loadVideoResolve = undefined
                    }
                  }
                } catch (e) {
                  // Duration not available yet, will be caught by polling
                }
              }
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
      try {
        this.player.playVideo()
        // On iOS, sometimes the player gets stuck in buffering state
        // Check state after a short delay and clear buffering if actually playing
        setTimeout(() => {
          if (this.player && this.isReady) {
            const state = this.player.getPlayerState?.()
            // If playing or paused (not buffering), clear buffering state
            if (state === window.YT.PlayerState.PLAYING || state === window.YT.PlayerState.PAUSED) {
              this.bufferingCallback?.(false)
            }
          }
        }, 500)
        // Fallback: clear buffering after 3 seconds regardless
        setTimeout(() => {
          this.bufferingCallback?.(false)
        }, 3000)
      } catch (error) {
        console.error("YouTube play error:", error)
        this.bufferingCallback?.(false)
        throw error
      }
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
