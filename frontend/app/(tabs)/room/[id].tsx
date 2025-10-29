import { View, Text, StyleSheet, Platform, TouchableOpacity, LayoutChangeEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect, useRef } from "react";
import TrackPlayer, { usePlaybackState, useProgress, State } from "react-native-track-player";
import { Image } from "expo-image";
import WebNav from "../../../components/WebNav";
import { Theme } from "../../../constants/theme";
import { useLocalSearchParams, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

// Temporary song data (in real app, fetch from API)
const currentSong = {
  id: '1',
  title: 'Blinding Lights',
  artist: 'The Weeknd',
  thumbnail: 'https://picsum.photos/1000',
  audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
};

export default function RoomDetail() {
  const { id } = useLocalSearchParams();
  const playbackState = usePlaybackState();
  const progress = useProgress();
  const [isLoading, setIsLoading] = useState(true);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const progressBarRef = useRef<View | null>(null);

  // Handle playback state - can be State enum or object with state property
  const playbackStateValue = typeof playbackState === 'object' && playbackState !== null && 'state' in playbackState 
    ? playbackState.state 
    : playbackState;
  const isPlaying = playbackStateValue === State.Playing;
  const position = progress.position * 1000; // Convert to milliseconds
  const duration = progress.duration * 1000; // Convert to milliseconds

  useEffect(() => {
    // Load track on mount
    if (Platform.OS !== 'web') {
      loadTrack();
    } else {
      setIsLoading(false);
    }

    return () => {
      // Cleanup on unmount
      if (Platform.OS !== 'web') {
        TrackPlayer.stop().catch(console.error);
        TrackPlayer.reset().catch(console.error);
      }
    };
  }, []);

  async function loadTrack() {
    try {
      setIsLoading(true);
      
      // Reset and add track
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: currentSong.id,
        url: currentSong.audioUrl,
        title: currentSong.title,
        artist: currentSong.artist,
        artwork: currentSong.thumbnail,
      });
      
      setIsLoading(false);
      console.log('Track loaded successfully');
    } catch (error) {
      console.error('Error loading track:', error);
      setIsLoading(false);
      alert('Failed to load audio. Please check the audio URL.');
    }
  }

  async function togglePlayPause() {
    if (Platform.OS === 'web') {
      alert('Audio playback is only available on native platforms');
      return;
    }

    try {
      if (isPlaying) {
        await TrackPlayer.pause();
      } else {
        await TrackPlayer.play();
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
      alert('Failed to control playback: ' + (error as Error).message);
    }
  }

  async function seekTo(positionMillis: number) {
    if (Platform.OS === 'web') return;
    if (!isFinite(positionMillis)) return;

    // Convert to seconds (TrackPlayer uses seconds)
    const positionSeconds = positionMillis / 1000;
    
    // Ensure the position is valid and within bounds
    const validPosition = Math.max(0, Math.min(duration / 1000 || 0, positionSeconds));
    
    if (!isFinite(validPosition) || validPosition < 0) {
      console.warn('Invalid seek position:', positionMillis);
      return;
    }

    try {
      await TrackPlayer.seekTo(validPosition);
    } catch (error) {
      console.error('Error seeking:', error);
    }
  }

  const formatTime = (millis: number) => {
    if (!isFinite(millis) || millis < 0) return '0:00';
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          title: '',
        }}
      />
      <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? [] : ['top']}>
        {Platform.OS === 'web' && <WebNav />}
        
        {/* Now Playing Card */}
        <View style={styles.nowPlayingCard}>
          <Image
            source={{ uri: currentSong.thumbnail }}
            style={styles.thumbnail}
            contentFit="cover"
          />
          <View style={styles.songInfo}>
            <Text style={styles.songTitle} numberOfLines={1}>{currentSong.title}</Text>
            <Text style={styles.songArtist} numberOfLines={1}>{currentSong.artist}</Text>
          </View>
        </View>

        {/* Audio Player Controls */}
        <View style={styles.playerContainer}>
          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBarWrapper}>
              <TouchableOpacity
                ref={progressBarRef}
                style={styles.progressBarTouchable}
                activeOpacity={1}
                disabled={Platform.OS === 'web'}
                onLayout={(e: LayoutChangeEvent) => {
                  const width = e.nativeEvent.layout.width;
                  setProgressBarWidth(width);
                }}
                onPress={(e) => {
                  // Get X position - different for web vs native
                  let locationX: number | undefined;
                  if (Platform.OS === 'web') {
                    return; // Disabled on web
                  } else {
                    locationX = e.nativeEvent.locationX;
                  }

                  // Validate all inputs
                  if (!duration || !isFinite(duration) || duration <= 0) {
                    console.warn('Invalid duration:', duration);
                    return;
                  }

                  if (!progressBarWidth || !isFinite(progressBarWidth) || progressBarWidth <= 0) {
                    console.warn('Invalid progressBarWidth:', progressBarWidth);
                    return;
                  }

                  if (locationX === undefined || locationX === null || !isFinite(locationX)) {
                    console.warn('Invalid locationX:', locationX);
                    return;
                  }

                  // Calculate seek position
                  const clampedX = Math.max(0, Math.min(progressBarWidth, locationX));
                  const seekPercent = (clampedX / progressBarWidth) * 100;

                  if (!isFinite(seekPercent) || seekPercent < 0 || seekPercent > 100) {
                    console.warn('Invalid seekPercent:', seekPercent);
                    return;
                  }

                  const seekMillis = Math.round((seekPercent / 100) * duration);

                  if (isFinite(seekMillis) && seekMillis >= 0 && seekMillis <= duration) {
                    seekTo(seekMillis);
                  } else {
                    console.warn('Final validation failed:', { seekMillis, duration, seekPercent, clampedX });
                  }
                }}
              >
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, progressPercent))}%` }]} />
                </View>
                <View
                  style={[
                    styles.progressHandle,
                    {
                      left: `${Math.min(100, Math.max(0, progressPercent))}%`,
                    }
                  ]}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Time Display */}
          <View style={styles.timeContainer}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>

          {/* Control Buttons */}
          <View style={styles.controlsContainer}>
            <TouchableOpacity style={styles.controlButton} disabled={Platform.OS === 'web'}>
              <Ionicons name="shuffle" size={24} color={Theme.text.secondary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton} disabled={Platform.OS === 'web'}>
              <Ionicons name="play-skip-back" size={28} color={Theme.text.primary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[
                styles.playButton,
                (isLoading || Platform.OS === 'web') && styles.playButtonDisabled
              ]}
              onPress={togglePlayPause}
              disabled={isLoading || Platform.OS === 'web'}
            >
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={32}
                color={!isLoading && Platform.OS !== 'web' ? Theme.background.primary : Theme.text.muted}
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton} disabled={Platform.OS === 'web'}>
              <Ionicons name="play-skip-forward" size={28} color={Theme.text.primary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton} disabled={Platform.OS === 'web'}>
              <Ionicons name="repeat" size={24} color={Theme.text.secondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Canvas Area */}
        <View style={styles.canvas}>
          <View style={styles.canvasContent}>
            <Ionicons name="musical-notes" size={64} color={Theme.accent.primary} />
            <Text style={styles.canvasText}>Your Room Canvas</Text>
            <Text style={styles.canvasSubtext}>Build your music room here</Text>
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background.primary,
  },
  nowPlayingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.background.nav,
    marginHorizontal: 20,
    marginTop: Platform.OS === 'web' ? 20 : 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.background.border,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 16,
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    color: Theme.text.primary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  songArtist: {
    color: Theme.text.secondary,
    fontSize: 14,
  },
  playerContainer: {
    backgroundColor: Theme.background.nav,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.background.border,
  },
  progressContainer: {
    marginBottom: 12,
    width: '100%',
  },
  progressBarWrapper: {
    width: '100%',
    position: 'relative',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBarTouchable: {
    position: 'relative',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  progressBar: {
    height: 4,
    backgroundColor: Theme.background.border,
    borderRadius: 2,
    width: '100%',
    position: 'relative',
    overflow: 'visible',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Theme.accent.primary,
    borderRadius: 2,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  progressHandle: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Theme.accent.primary,
    top: '50%',
    marginTop: -8,
    marginLeft: -8,
    borderWidth: 2,
    borderColor: Theme.background.primary,
    zIndex: 1,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  timeText: {
    color: Theme.text.muted,
    fontSize: 12,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  controlButton: {
    padding: 8,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Theme.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 4,
  },
  playButtonDisabled: {
    backgroundColor: Theme.background.border,
    opacity: 0.5,
  },
  canvas: {
    flex: 1,
    backgroundColor: Theme.background.nav,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.background.border,
  },
  canvasContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  canvasText: {
    color: Theme.text.primary,
    fontSize: 24,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 8,
  },
  canvasSubtext: {
    color: Theme.text.secondary,
    fontSize: 16,
  },
});
