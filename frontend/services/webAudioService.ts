// Web audio service using Howler.js
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Howl } = require('howler');

let howlInstance: any = null;

export interface WebAudioTrack {
  id: string;
  url: string;
  title: string;
  artist: string;
  artwork?: string;
}

export function loadTrack(track: WebAudioTrack): Promise<void> {
  return new Promise((resolve, reject) => {
    // Cleanup existing instance
    if (howlInstance) {
      howlInstance.unload();
      howlInstance = null;
    }

    howlInstance = new Howl({
      src: [track.url],
      html5: true,
      preload: true,
      onload: () => {
        console.log('Howler track loaded');
        resolve();
      },
      onloaderror: (_id: number, error: Error) => {
        console.error('Howler load error:', error);
        reject(error);
      },
    });

    // Trigger load
    howlInstance.load();
  });
}

export function play(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!howlInstance) {
      reject(new Error('No track loaded'));
      return;
    }
    howlInstance.play();
    resolve();
  });
}

export function pause(): void {
  if (howlInstance) {
    howlInstance.pause();
  }
}

export function stop(): void {
  if (howlInstance) {
    howlInstance.stop();
    howlInstance = null;
  }
}

export function seekTo(position: number): void {
  if (howlInstance) {
    howlInstance.seek(position / 1000); // Convert ms to seconds
  }
}

export function getPosition(): number {
  if (!howlInstance) return 0;
  return (howlInstance.seek() as number) * 1000; // Convert seconds to ms
}

export function getDuration(): number {
  if (!howlInstance) return 0;
  return howlInstance.duration() * 1000; // Convert seconds to ms
}

export function isPlaying(): boolean {
  if (!howlInstance) return false;
  return howlInstance.playing();
}

export function on(event: 'play' | 'pause' | 'stop' | 'end' | 'seek', callback: () => void): void {
  if (!howlInstance) return;
  // Howler uses different event names
  const howlEvent = event === 'play' ? 'play' : 
                    event === 'pause' ? 'pause' : 
                    event === 'stop' ? 'stop' : 
                    event === 'end' ? 'end' : 'seek';
  
  if (howlInstance) {
    howlInstance.on(howlEvent, callback);
  }
}

export function off(event: 'play' | 'pause' | 'stop' | 'end' | 'seek', callback?: () => void): void {
  if (!howlInstance) return;
  const howlEvent = event === 'play' ? 'play' : 
                    event === 'pause' ? 'pause' : 
                    event === 'stop' ? 'stop' : 
                    event === 'end' ? 'end' : 'seek';
  
  if (howlInstance) {
    howlInstance.off(howlEvent, callback);
  }
}

export function cleanup(): void {
  if (howlInstance) {
    howlInstance.unload();
    howlInstance = null;
  }
}

