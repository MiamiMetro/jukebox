import TrackPlayer, { Capability, State } from 'react-native-track-player';

export async function setupTrackPlayer() {
  await TrackPlayer.setupPlayer({});
  
  // Enable capabilities for native controls
  await TrackPlayer.updateOptions({
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.Stop,
      Capability.SeekTo,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
    ],
    compactCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SeekTo,
    ],
  });
}

export async function addTrack(track: {
  id: string;
  url: string;
  title: string;
  artist: string;
  artwork?: string;
}) {
  await TrackPlayer.add({
    id: track.id,
    url: track.url,
    title: track.title,
    artist: track.artist,
    artwork: track.artwork,
  });
}

export async function play() {
  await TrackPlayer.play();
}

export async function pause() {
  await TrackPlayer.pause();
}

export async function stop() {
  await TrackPlayer.stop();
}

export async function seekTo(position: number) {
  await TrackPlayer.seekTo(position);
}

export async function getPosition() {
  return await TrackPlayer.getPosition();
}

export async function getDuration() {
  return await TrackPlayer.getDuration();
}

export async function getState() {
  return await TrackPlayer.getState();
}

