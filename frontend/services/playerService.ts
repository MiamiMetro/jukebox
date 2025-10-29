import TrackPlayer, { Capability, State, Event } from 'react-native-track-player';

let serviceInitialized = false;

export const PlaybackService = async () => {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
};

export const setupPlayer = async () => {
  if (serviceInitialized) return;
  
  try {
    await TrackPlayer.setupPlayer();
    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.Stop,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
      ],
    });
    serviceInitialized = true;
  } catch (error) {
    console.error('Error setting up player:', error);
  }
};

export const addTracks = async () => {
  const tracks = [
    {
      id: '1',
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      artwork: 'https://picsum.photos/500',
    },
    {
      id: '2',
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
      title: 'Stay',
      artist: 'The Kid LAROI & Justin Bieber',
      artwork: 'https://picsum.photos/501',
    },
    {
      id: '3',
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
      title: 'Heat Waves',
      artist: 'Glass Animals',
      artwork: 'https://picsum.photos/502',
    },
  ];
  
  await TrackPlayer.add(tracks);
};

