import type { AudioSource, AudioPlayerAdapter } from "@/types/audio-player"
import { HTML5AudioAdapter } from "./html5-adapter"
import { YouTubeAudioAdapter } from "./youtube-adapter"

export class AudioAdapterFactory {
  static createAdapter(source: AudioSource, containerId?: string): AudioPlayerAdapter {
    switch (source) {
      case "html5":
        return new HTML5AudioAdapter()
      case "youtube":
        return new YouTubeAudioAdapter(containerId)
      case "howler":
        // You can implement Howler adapter later
        return new HTML5AudioAdapter()
      default:
        return new HTML5AudioAdapter()
    }
  }
}
