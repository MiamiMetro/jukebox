import { View, Text, StyleSheet, Platform, TouchableOpacity, LayoutChangeEvent, PanResponder } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect, useRef } from "react";
import { Image } from "expo-image";
import WebNav from "../../../components/WebNav";
import { Theme } from "../../../constants/theme";
import { useLocalSearchParams, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

// Conditional imports based on platform
let TrackPlayer: any = null;
let usePlaybackState: any = null;
let useProgress: any = null;
let State: any = null;

if (Platform.OS !== 'web') {
  const trackPlayerModule = require("react-native-track-player");
  TrackPlayer = trackPlayerModule.default;
  usePlaybackState = trackPlayerModule.usePlaybackState;
  useProgress = trackPlayerModule.useProgress;
  State = trackPlayerModule.State;
}

// Web audio service (only imported on web)
let webAudioService: any = null;
if (Platform.OS === 'web') {
  webAudioService = require("../../../services/webAudioService");
}

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
  
  // Native player hooks (only used on mobile)
  const playbackState = Platform.OS !== 'web' && usePlaybackState ? usePlaybackState() : null;
  const progress = Platform.OS !== 'web' && useProgress ? useProgress() : null;
  
  // Web player state
  const [webIsPlaying, setWebIsPlaying] = useState(false);
  const [webPosition, setWebPosition] = useState(0);
  const [webDuration, setWebDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const progressBarRef = useRef<View | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDraggingRef = useRef(false);

  // Handle playback state - native vs web
  let isPlaying = false;
  let basePosition = 0;
  let duration = 0;

  if (Platform.OS === 'web') {
    isPlaying = webIsPlaying;
    // Don't update base position during drag - prevents snap back
    if (!isDragging) {
      basePosition = webPosition;
    }
    duration = webDuration;
  } else {
    // Handle playback state - can be State enum or object with state property
    const playbackStateValue = playbackState && typeof playbackState === 'object' && playbackState !== null && 'state' in playbackState 
      ? playbackState.state 
      : playbackState;
    isPlaying = playbackStateValue === State?.Playing;
    // Don't update base position during drag - prevents snap back
    if (!isDragging && progress) {
      basePosition = progress.position * 1000; // Convert to milliseconds
      duration = progress.duration * 1000; // Convert to milliseconds
    } else if (progress) {
      duration = progress.duration * 1000; // Still need duration
    } else {
      basePosition = 0;
      duration = 0;
    }
  }

  // Use drag position if dragging, otherwise use actual position
  const position = isDragging ? dragPosition : basePosition;

  useEffect(() => {
    // Load track on mount
    if (Platform.OS === 'web') {
      loadWebTrack();
    } else {
      loadTrack();
    }

    return () => {
      // Cleanup on unmount
      if (Platform.OS === 'web') {
        if (webAudioService) {
          webAudioService.cleanup();
        }
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
      } else {
        if (TrackPlayer) {
          TrackPlayer.stop().catch(console.error);
          TrackPlayer.reset().catch(console.error);
        }
      }
    };
  }, []);

  async function loadWebTrack() {
    if (!webAudioService) return;
    
    try {
      setIsLoading(true);
      
      await webAudioService.loadTrack({
        id: currentSong.id,
        url: currentSong.audioUrl,
        title: currentSong.title,
        artist: currentSong.artist,
        artwork: currentSong.thumbnail,
      });

      // Set initial duration
      const dur = webAudioService.getDuration();
      setWebDuration(dur);

      // Set up progress updates
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      progressIntervalRef.current = setInterval(() => {
        if (webAudioService && !isDraggingRef.current) {
          setWebPosition(webAudioService.getPosition());
          setWebIsPlaying(webAudioService.isPlaying());
          const dur = webAudioService.getDuration();
          if (dur > 0) {
            setWebDuration(dur);
          }
        }
      }, 100);

      // Set up event listeners
      webAudioService.on('play', () => setWebIsPlaying(true));
      webAudioService.on('pause', () => setWebIsPlaying(false));
      webAudioService.on('end', () => {
        setWebIsPlaying(false);
        setWebPosition(0);
      });
      
      setIsLoading(false);
      console.log('Web track loaded successfully');
    } catch (error) {
      console.error('Error loading web track:', error);
      setIsLoading(false);
      alert('Failed to load audio. Please check the audio URL.');
    }
  }

  async function loadTrack() {
    if (!TrackPlayer) return;
    
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
    try {
      if (Platform.OS === 'web') {
        if (!webAudioService) return;
        
        if (webIsPlaying) {
          webAudioService.pause();
        } else {
          await webAudioService.play();
        }
      } else {
        if (!TrackPlayer) return;
        
        if (isPlaying) {
          await TrackPlayer.pause();
        } else {
          await TrackPlayer.play();
        }
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
      alert('Failed to control playback: ' + (error as Error).message);
    }
  }

  async function seekTo(positionMillis: number): Promise<void> {
    if (!isFinite(positionMillis)) return Promise.resolve();

    try {
      if (Platform.OS === 'web') {
        if (!webAudioService) return Promise.resolve();
        
        // Ensure the position is valid and within bounds
        const validPosition = Math.max(0, Math.min(webDuration || 0, positionMillis));
        
        if (!isFinite(validPosition) || validPosition < 0) {
          console.warn('Invalid seek position:', positionMillis);
          return Promise.resolve();
        }
        
        webAudioService.seekTo(validPosition);
        return Promise.resolve();
      } else {
        if (!TrackPlayer) return Promise.resolve();
        
        // Convert to seconds (TrackPlayer uses seconds)
        const positionSeconds = positionMillis / 1000;
        
        // Ensure the position is valid and within bounds
        const validPosition = Math.max(0, Math.min(duration / 1000 || 0, positionSeconds));
        
        if (!isFinite(validPosition) || validPosition < 0) {
          console.warn('Invalid seek position:', positionMillis);
          return Promise.resolve();
        }
        
        await TrackPlayer.seekTo(validPosition);
        return Promise.resolve();
      }
    } catch (error) {
      console.error('Error seeking:', error);
      return Promise.resolve();
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

  // Helper function to get X position from event
  const getXFromEvent = (nativeEvent: any, target: any): number | undefined => {
    if (Platform.OS === 'web') {
      if (target && target.getBoundingClientRect) {
        const rect = target.getBoundingClientRect();
        return nativeEvent.clientX - rect.left;
      }
      return nativeEvent.locationX;
    }
    return nativeEvent.locationX;
  };

  // Helper function to calculate seek position from X coordinate
  const calculateSeekPosition = (locationX: number): number | null => {
    if (!duration || !isFinite(duration) || duration <= 0) {
      return null;
    }

    if (!progressBarWidth || !isFinite(progressBarWidth) || progressBarWidth <= 0) {
      return null;
    }

    if (locationX === undefined || locationX === null || !isFinite(locationX)) {
      return null;
    }

    const clampedX = Math.max(0, Math.min(progressBarWidth, locationX));
    const seekPercent = (clampedX / progressBarWidth) * 100;

    if (!isFinite(seekPercent) || seekPercent < 0 || seekPercent > 100) {
      return null;
    }

    const seekMillis = Math.round((seekPercent / 100) * duration);

    if (isFinite(seekMillis) && seekMillis >= 0 && seekMillis <= duration) {
      return seekMillis;
    }

    return null;
  };

  // Handle drag start
  const handleDragStart = (locationX: number) => {
    const seekPos = calculateSeekPosition(locationX);
    if (seekPos !== null) {
      isDraggingRef.current = true;
      setIsDragging(true);
      setDragPosition(seekPos);
      // Store the position we started from to prevent snap back
      if (Platform.OS === 'web') {
        setWebPosition(seekPos);
      }
    }
  };

  // Handle drag move
  const handleDragMove = (locationX: number) => {
    if (!isDragging) return;
    const seekPos = calculateSeekPosition(locationX);
    if (seekPos !== null) {
      setDragPosition(seekPos);
    }
  };

  // Handle drag end
  const handleDragEnd = () => {
    if (isDraggingRef.current) {
      const finalPosition = dragPosition;
      isDraggingRef.current = false;
      setIsDragging(false);
      // Seek after updating dragging state
      seekTo(finalPosition).then(() => {
        // Update position state after seeking to prevent snap back
        if (Platform.OS === 'web') {
          setWebPosition(finalPosition);
        }
      });
    }
  };

  // PanResponder for native drag gestures
  const panResponder = useRef(
    Platform.OS !== 'web'
      ? PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderGrant: (evt) => {
            const locationX = evt.nativeEvent.locationX;
            handleDragStart(locationX);
          },
          onPanResponderMove: (evt) => {
            const locationX = evt.nativeEvent.locationX;
            handleDragMove(locationX);
          },
          onPanResponderRelease: () => {
            handleDragEnd();
          },
          onPanResponderTerminate: () => {
            handleDragEnd();
          },
        })
      : null
  ).current;

  // Web touch/mouse handlers
  const handleWebStart = (e: any) => {
    const target = e.currentTarget || e.target;
    const nativeEvent = e.nativeEvent || e;
    const rect = progressBarRef.current ? (progressBarRef.current as any).getBoundingClientRect?.() : null;
    
    let locationX: number | undefined;
    if (Platform.OS === 'web') {
      if (rect && nativeEvent.clientX !== undefined) {
        locationX = nativeEvent.clientX - rect.left;
      } else if (nativeEvent.touches?.[0]) {
        const touch = nativeEvent.touches[0];
        locationX = touch.clientX - (rect?.left || 0);
      } else {
        return;
      }
    }
    
    if (locationX !== undefined) {
      handleDragStart(locationX);
    }
  };

  const handleWebMove = (e: any) => {
    if (!isDragging) return;
    
    const nativeEvent = e.nativeEvent || e;
    const rect = progressBarRef.current ? (progressBarRef.current as any).getBoundingClientRect?.() : null;
    
    let locationX: number | undefined;
    if (Platform.OS === 'web') {
      if (rect && nativeEvent.clientX !== undefined) {
        locationX = nativeEvent.clientX - rect.left;
      } else if (nativeEvent.touches?.[0]) {
        const touch = nativeEvent.touches[0];
        locationX = touch.clientX - (rect?.left || 0);
      } else {
        return;
      }
    }
    
    if (locationX !== undefined) {
      handleDragMove(locationX);
    }
  };

  const handleWebEnd = () => {
    handleDragEnd();
  };

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
            <View
              style={styles.progressBarWrapper}
              ref={progressBarRef}
              onLayout={(e: LayoutChangeEvent) => {
                const width = e.nativeEvent.layout.width;
                setProgressBarWidth(width);
              }}
              {...(panResponder?.panHandlers || {})}
              {...(Platform.OS === 'web' ? {
                onTouchStart: handleWebStart,
                onTouchMove: handleWebMove,
                onTouchEnd: handleWebEnd,
                // @ts-ignore - web mouse events on react-native-web
                onMouseDown: handleWebStart,
                onMouseMove: isDragging ? handleWebMove : undefined,
                onMouseUp: handleWebEnd,
                onMouseLeave: handleWebEnd,
              } : {})}
            >
              <TouchableOpacity
                style={styles.progressBarTouchable}
                activeOpacity={1}
                onPress={(e) => {
                  // Only handle tap if not dragging
                  if (isDragging) return;
                  
                  // Get X position - different for web vs native
                  let locationX: number | undefined;
                  if (Platform.OS === 'web') {
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

                  if (locationX !== undefined) {
                    const seekPos = calculateSeekPosition(locationX);
                    if (seekPos !== null) {
                      seekTo(seekPos);
                    }
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
            <TouchableOpacity style={styles.controlButton}>
              <Ionicons name="shuffle" size={24} color={Theme.text.secondary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton}>
              <Ionicons name="play-skip-back" size={28} color={Theme.text.primary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[
                styles.playButton,
                isLoading && styles.playButtonDisabled
              ]}
              onPress={togglePlayPause}
              disabled={isLoading}
            >
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={32}
                color={!isLoading ? Theme.background.primary : Theme.text.muted}
                style={!isPlaying ? { marginLeft: 2 } : undefined}
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
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Theme.accent.primary,
    top: '50%',
    marginTop: -10,
    marginLeft: -10,
    borderWidth: 3,
    borderColor: Theme.background.primary,
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
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
