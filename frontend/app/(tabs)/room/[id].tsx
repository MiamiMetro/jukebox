import { View, Text, StyleSheet, Platform, TouchableOpacity, LayoutChangeEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect, useRef } from "react";
import { Audio } from "expo-av";
import { Image } from "expo-image";
import WebNav from "../../../components/WebNav";
import { Theme } from "../../../constants/theme";
import { useLocalSearchParams, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

// Temporary song data (in real app, fetch from API)
const currentSong = {
  title: 'Blinding Lights',
  artist: 'The Weeknd',
  thumbnail: 'https://picsum.photos/1000',
  audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // Demo audio URL
};

export default function RoomDetail() {
  const { id } = useLocalSearchParams();
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const progressBarRef = useRef<View | null>(null);
  const playbackStatusUpdateInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Set audio mode for background playback
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true, // Allow playback in background
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).then(() => {
      // Load audio directly - no permissions needed for playback
      loadAudio();
    }).catch((error) => {
      console.error('Error setting audio mode:', error);
      // Still try to load audio even if mode setting fails
      loadAudio();
    });

    return () => {
      if (sound) {
        sound.unloadAsync().catch((error) => {
          console.error('Error unloading sound:', error);
        });
      }
      if (playbackStatusUpdateInterval.current) {
        clearInterval(playbackStatusUpdateInterval.current);
      }
    };
  }, []);

  // Cleanup sound when component unmounts
  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync().catch(() => {});
      }
    };
  }, [sound]);

  async function loadAudio() {
    try {
      setIsLoading(true);
      // Unload existing sound if any
      if (sound) {
        await sound.unloadAsync();
      }

      console.log('Loading audio from:', currentSong.audioUrl);
      const { sound: newSound } = await Audio.Sound.createAsync(
        { 
          uri: currentSong.audioUrl,
        },
        { 
          shouldPlay: false,
          isLooping: false,
          progressUpdateIntervalMillis: 1000,
        }
      );
      
      // expo-av automatically exposes to native controls when:
      // 1. staysActiveInBackground is true (set in Audio.setAudioModeAsync)
      // 2. Audio is playing
      // Metadata will be read from the audio file's ID3 tags
      // For custom metadata, you'd need to embed it in the audio file
      setSound(newSound);
      setIsLoading(false);

      // Get initial status
      const status = await newSound.getStatusAsync();
      console.log('Audio loaded, status:', status.isLoaded);
      if (status.isLoaded) {
        setDuration(status.durationMillis || 0);
        setIsPlaying(status.isPlaying || false);
        setPosition(status.positionMillis || 0);
      }

      // Set up status updates
      newSound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded) {
          setIsPlaying(status.isPlaying || false);
          setPosition(status.positionMillis || 0);
          if (status.durationMillis) {
            setDuration(status.durationMillis);
          }
          if (status.didJustFinish) {
            setIsPlaying(false);
            setPosition(0);
          }
        }
      });
    } catch (error) {
      console.error('Error loading audio:', error);
      setIsLoading(false);
      alert('Failed to load audio. Please check the audio URL.');
    }
  }

  async function togglePlayPause() {
    if (!sound) {
      console.warn('Sound not loaded yet');
      return;
    }

    try {
      // Ensure audio mode is set before playback
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const status = await sound.getStatusAsync();
      console.log('Current status:', status);
      
      if (!status.isLoaded) {
        console.warn('Sound is not loaded');
        return;
      }

      // Use the actual status from the sound object, not the state
      if (status.isPlaying) {
        console.log('Pausing audio...');
        await sound.pauseAsync();
      } else {
        console.log('Playing audio...');
        await sound.playAsync();
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
      alert('Failed to control playback: ' + (error as Error).message);
    }
  }

  async function seekTo(positionMillis: number) {
    if (!sound || !isFinite(positionMillis)) return;

    // Ensure the position is valid and within bounds
    const validPosition = Math.max(0, Math.min(duration || 0, Math.round(positionMillis)));
    
    if (validPosition < 0 || !isFinite(validPosition)) {
      console.warn('Invalid seek position:', positionMillis);
      return;
    }

    try {
      await sound.setPositionAsync(validPosition);
    } catch (error) {
      console.error('Error seeking:', error);
    }
  }

  const formatTime = (millis: number) => {
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
            <TouchableOpacity
              ref={progressBarRef}
              style={styles.progressBarWrapper}
              activeOpacity={1}
              onLayout={(e: LayoutChangeEvent) => {
                const width = e.nativeEvent.layout.width;
                setProgressBarWidth(width);
                console.log('Progress bar layout:', width);
              }}
              onPress={(e) => {
                // Get X position - different for web vs native
                let locationX: number | undefined;
                if (Platform.OS === 'web') {
                  // On web, use clientX relative to the element
                  const nativeEvent = e.nativeEvent as any;
                  const target = e.currentTarget as any;
                  if (target && target.getBoundingClientRect) {
                    const rect = target.getBoundingClientRect();
                    locationX = nativeEvent.clientX - rect.left;
                  } else {
                    locationX = nativeEvent.locationX;
                  }
                } else {
                  locationX = e.nativeEvent.locationX;
                }
                
                console.log('Tap event:', { locationX, progressBarWidth, duration, sound: !!sound, platform: Platform.OS });
                
                // Validate all inputs
                if (!sound) {
                  console.warn('Sound not available');
                  return;
                }
                
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
                  console.warn('Invalid seekPercent:', seekPercent, 'from clampedX:', clampedX, 'width:', progressBarWidth);
                  return;
                }
                
                const seekMillis = Math.round((seekPercent / 100) * duration);
                
                if (isFinite(seekMillis) && seekMillis >= 0 && seekMillis <= duration) {
                  console.log('Seeking to:', seekMillis, 'ms (', seekPercent.toFixed(1), '%)');
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

          {/* Time Display */}
          <View style={styles.timeContainer}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>

          {/* Control Buttons */}
          <View style={styles.controlsContainer}>
            <TouchableOpacity style={styles.controlButton}>
              <Ionicons name="shuffle" size={24} color={Theme.text.secondary} />
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.controlButton}>
              <Ionicons name="play-skip-back" size={28} color={Theme.text.primary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[
                styles.playButton,
                (!sound || isLoading) && styles.playButtonDisabled
              ]}
              onPress={togglePlayPause}
              disabled={!sound || isLoading}
            >
              <Ionicons 
                name={isPlaying ? "pause" : "play"} 
                size={32} 
                color={sound && !isLoading ? Theme.background.primary : Theme.text.muted} 
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton}>
              <Ionicons name="play-skip-forward" size={28} color={Theme.text.primary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton}>
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
    paddingLeft: 4, // Slight offset for play icon
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

