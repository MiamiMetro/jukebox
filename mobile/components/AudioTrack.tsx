import { View, Text, StyleSheet, Platform, TouchableOpacity, LayoutChangeEvent, PanResponder } from "react-native";
import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Theme } from "../constants/theme";

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
let webAudioService: {
  loadTrack: (track: any) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  seekTo: (position: number) => void;
  getPosition: () => number;
  getDuration: () => number;
  isPlaying: () => boolean;
  on: (event: string, callback: () => void) => void;
  cleanup: () => void;
} | null = null;
if (Platform.OS === 'web') {
  webAudioService = require("../services/webAudioService");
}

export interface AudioTrackData {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  thumbnail?: string;
  artwork?: string;
}

export interface AudioTrackCallbacks {
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: (position: number) => void;
  onTrackChange?: (track: AudioTrackData) => void;
  onTrackEnd?: () => void;
  onLoadingChange?: (isLoading: boolean) => void;
}

export interface AudioTrackRef {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekTo: (positionMillis: number) => Promise<void>;
  setTrack: (track: AudioTrackData) => Promise<void>;
  getPosition: () => number;
  getDuration: () => number;
  isPlaying: () => boolean;
  isLoading: () => boolean;
  getCurrentTrack: () => AudioTrackData | null;
}

export interface AudioTrackProps {
  track?: AudioTrackData;
  callbacks?: AudioTrackCallbacks;
  showThumbnail?: boolean;
  showControlButtons?: boolean;
  showProgressBar?: boolean;
  showTimeDisplay?: boolean;
  customStyles?: {
    container?: object;
    thumbnail?: object;
    songTitle?: object;
    songArtist?: object;
    progressBar?: object;
    controlButton?: object;
    playButton?: object;
  };
}

const AudioTrack = forwardRef<AudioTrackRef, AudioTrackProps>((props, ref) => {
  const {
    track: initialTrack,
    callbacks,
    showThumbnail = true,
    showControlButtons = true,
    showProgressBar = true,
    showTimeDisplay = true,
    customStyles = {},
  } = props;

  // Track state
  const [currentTrack, setCurrentTrack] = useState<AudioTrackData | null>(initialTrack || null);
  
  // Native player hooks (only used on mobile)
  const playbackState = Platform.OS !== 'web' && usePlaybackState ? usePlaybackState() : null;
  const progress = Platform.OS !== 'web' && useProgress ? useProgress() : null;
  
  // Web player state
  const [webIsPlaying, setWebIsPlaying] = useState(false);
  const [webPosition, setWebPosition] = useState(0);
  const [webDuration, setWebDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const progressBarRef = useRef<View | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDraggingRef = useRef(false);
  const currentTrackRef = useRef<AudioTrackData | null>(initialTrack || null);

  // Handle playback state - native vs web
  let isPlaying = false;
  let basePosition = 0;
  let duration = 0;

  if (Platform.OS === 'web') {
    isPlaying = webIsPlaying;
    if (!isDragging) {
      basePosition = webPosition;
    }
    duration = webDuration;
  } else {
    const playbackStateValue = playbackState && typeof playbackState === 'object' && playbackState !== null && 'state' in playbackState 
      ? playbackState.state 
      : playbackState;
    isPlaying = playbackStateValue === State?.Playing;
    if (!isDragging && progress) {
      basePosition = progress.position * 1000;
      duration = progress.duration * 1000;
    } else if (progress) {
      duration = progress.duration * 1000;
    } else {
      basePosition = 0;
      duration = 0;
    }
  }

  const position = isDragging ? dragPosition : basePosition;

  // Expose API via ref
  useImperativeHandle(ref, () => ({
    play: async () => {
      try {
        if (Platform.OS === 'web') {
          if (!webAudioService) return;
          await webAudioService.play();
          callbacks?.onPlay?.();
        } else {
          if (!TrackPlayer) return;
          await TrackPlayer.play();
          callbacks?.onPlay?.();
        }
      } catch (error) {
        console.error('Error playing:', error);
        throw error;
      }
    },
    pause: async () => {
      try {
        if (Platform.OS === 'web') {
          if (!webAudioService) return;
          webAudioService.pause();
          callbacks?.onPause?.();
        } else {
          if (!TrackPlayer) return;
          await TrackPlayer.pause();
          callbacks?.onPause?.();
        }
      } catch (error) {
        console.error('Error pausing:', error);
        throw error;
      }
    },
    togglePlayPause: async () => {
      try {
        if (Platform.OS === 'web') {
          if (!webAudioService) return;
          if (isPlaying) {
            webAudioService.pause();
            callbacks?.onPause?.();
          } else {
            await webAudioService.play();
            callbacks?.onPlay?.();
          }
        } else {
          if (!TrackPlayer) return;
          if (isPlaying) {
            await TrackPlayer.pause();
            callbacks?.onPause?.();
          } else {
            await TrackPlayer.play();
            callbacks?.onPlay?.();
          }
        }
      } catch (error) {
        console.error('Error toggling playback:', error);
      }
    },
    seekTo: async (positionMillis: number) => {
      if (!isFinite(positionMillis)) return Promise.resolve();

      try {
        if (Platform.OS === 'web') {
          if (!webAudioService) return Promise.resolve();
          const validPosition = Math.max(0, Math.min(webDuration || 0, positionMillis));
          if (!isFinite(validPosition) || validPosition < 0) {
            console.warn('Invalid seek position:', positionMillis);
            return Promise.resolve();
          }
          webAudioService.seekTo(validPosition);
          setWebPosition(validPosition);
          callbacks?.onSeek?.(validPosition);
          return Promise.resolve();
        } else {
          if (!TrackPlayer) return Promise.resolve();
          const positionSeconds = positionMillis / 1000;
          const validPosition = Math.max(0, Math.min(duration / 1000 || 0, positionSeconds));
          if (!isFinite(validPosition) || validPosition < 0) {
            console.warn('Invalid seek position:', positionMillis);
            return Promise.resolve();
          }
          await TrackPlayer.seekTo(validPosition);
          callbacks?.onSeek?.(validPosition * 1000);
          return Promise.resolve();
        }
      } catch (error) {
        console.error('Error seeking:', error);
        return Promise.resolve();
      }
    },
    setTrack: async (track: AudioTrackData) => {
      currentTrackRef.current = track;
      setCurrentTrack(track);
      if (Platform.OS === 'web') {
        await loadWebTrack(track);
      } else {
        await loadTrack(track);
      }
      callbacks?.onTrackChange?.(track);
    },
    getPosition: () => position,
    getDuration: () => duration,
    isPlaying: () => isPlaying,
    isLoading: () => isLoading,
    getCurrentTrack: () => currentTrackRef.current,
  }), [isPlaying, webDuration, webIsPlaying, duration, position, isLoading, callbacks, currentTrackRef]);

  // Load track when currentTrack changes
  useEffect(() => {
    if (currentTrack) {
      if (Platform.OS === 'web') {
        loadWebTrack(currentTrack);
      } else {
        loadTrack(currentTrack);
      }
    }

    return () => {
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
  }, [currentTrack?.id]);

  async function loadWebTrack(track: AudioTrackData) {
    if (!webAudioService) return;
    
    try {
      setIsLoading(true);
      callbacks?.onLoadingChange?.(true);
      
      await webAudioService.loadTrack({
        id: track.id,
        url: track.audioUrl,
        title: track.title,
        artist: track.artist,
        artwork: track.thumbnail || track.artwork,
      });

      const dur = webAudioService.getDuration();
      setWebDuration(dur);

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

      webAudioService.on('play', () => {
        setWebIsPlaying(true);
        callbacks?.onPlay?.();
      });
      webAudioService.on('pause', () => {
        setWebIsPlaying(false);
        callbacks?.onPause?.();
      });
      webAudioService.on('end', () => {
        setWebIsPlaying(false);
        setWebPosition(0);
        callbacks?.onTrackEnd?.();
      });
      
      setIsLoading(false);
      callbacks?.onLoadingChange?.(false);
    } catch (error) {
      console.error('Error loading web track:', error);
      setIsLoading(false);
      callbacks?.onLoadingChange?.(false);
      throw error;
    }
  }

  async function loadTrack(track: AudioTrackData) {
    if (!TrackPlayer) return;
    
    try {
      setIsLoading(true);
      callbacks?.onLoadingChange?.(true);
      
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: track.id,
        url: track.audioUrl,
        title: track.title,
        artist: track.artist,
        artwork: track.thumbnail || track.artwork,
      });
      
      setIsLoading(false);
      callbacks?.onLoadingChange?.(false);
    } catch (error) {
      console.error('Error loading track:', error);
      setIsLoading(false);
      callbacks?.onLoadingChange?.(false);
      throw error;
    }
  }

  async function togglePlayPause() {
    try {
      if (Platform.OS === 'web') {
        if (!webAudioService) return;
        
        if (webIsPlaying) {
          webAudioService.pause();
          setWebIsPlaying(false);
          callbacks?.onPause?.();
        } else {
          await webAudioService.play();
          setWebIsPlaying(true);
          callbacks?.onPlay?.();
        }
      } else {
        if (!TrackPlayer) return;
        
        if (isPlaying) {
          await TrackPlayer.pause();
          callbacks?.onPause?.();
        } else {
          await TrackPlayer.play();
          callbacks?.onPlay?.();
        }
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
    }
  }

  async function seekTo(positionMillis: number): Promise<void> {
    if (!isFinite(positionMillis)) return Promise.resolve();

    try {
      if (Platform.OS === 'web') {
        if (!webAudioService) return Promise.resolve();
        
        const validPosition = Math.max(0, Math.min(webDuration || 0, positionMillis));
        
        if (!isFinite(validPosition) || validPosition < 0) {
          console.warn('Invalid seek position:', positionMillis);
          return Promise.resolve();
        }
        
        webAudioService.seekTo(validPosition);
        callbacks?.onSeek?.(validPosition);
        return Promise.resolve();
      } else {
        if (!TrackPlayer) return Promise.resolve();
        
        const positionSeconds = positionMillis / 1000;
        const validPosition = Math.max(0, Math.min(duration / 1000 || 0, positionSeconds));
        
        if (!isFinite(validPosition) || validPosition < 0) {
          console.warn('Invalid seek position:', positionMillis);
          return Promise.resolve();
        }
        
        await TrackPlayer.seekTo(validPosition);
        callbacks?.onSeek?.(validPosition * 1000);
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

  const handleDragStart = (locationX: number) => {
    const seekPos = calculateSeekPosition(locationX);
    if (seekPos !== null) {
      isDraggingRef.current = true;
      setIsDragging(true);
      setDragPosition(seekPos);
      if (Platform.OS === 'web') {
        setWebPosition(seekPos);
      }
    }
  };

  const handleDragMove = (locationX: number) => {
    if (!isDragging) return;
    const seekPos = calculateSeekPosition(locationX);
    if (seekPos !== null) {
      setDragPosition(seekPos);
    }
  };

  const handleDragEnd = () => {
    if (isDraggingRef.current) {
      const finalPosition = dragPosition;
      isDraggingRef.current = false;
      setIsDragging(false);
      seekTo(finalPosition).then(() => {
        if (Platform.OS === 'web') {
          setWebPosition(finalPosition);
        }
      });
    }
  };

  const dragStartPositionRef = useRef<number | null>(null);
  const hasMovedRef = useRef(false);
  
  const panResponder = useRef(
    Platform.OS !== 'web'
      ? PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderGrant: (evt) => {
            const locationX = evt.nativeEvent.locationX;
            dragStartPositionRef.current = locationX;
            hasMovedRef.current = false;
          },
          onPanResponderMove: (evt, gestureState) => {
            const locationX = evt.nativeEvent.locationX;
            // If there's significant movement, start dragging
            if (Math.abs(gestureState.dx) > 5 && !hasMovedRef.current) {
              hasMovedRef.current = true;
              // Start drag with current position when movement is detected
              handleDragStart(locationX);
            }
            if (hasMovedRef.current) {
              handleDragMove(locationX);
            }
          },
          onPanResponderRelease: (evt) => {
            const locationX = evt.nativeEvent.locationX;
            
            if (hasMovedRef.current) {
              // This was a drag, handle drag end
              handleDragEnd();
            } else {
              // This was a tap, seek to that position directly
              const seekPos = calculateSeekPosition(locationX);
              if (seekPos !== null) {
                seekTo(seekPos);
              }
            }
            dragStartPositionRef.current = null;
            hasMovedRef.current = false;
          },
          onPanResponderTerminate: () => {
            if (hasMovedRef.current) {
              handleDragEnd();
            }
            dragStartPositionRef.current = null;
            hasMovedRef.current = false;
          },
        })
      : null
  ).current;

  const handleWebStart = (e: any) => {
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

  if (!currentTrack) {
    return null;
  }

  return (
    <View style={[styles.container, customStyles.container]}>
      {showThumbnail && (
        <View style={styles.nowPlayingCard}>
          {currentTrack.thumbnail || currentTrack.artwork ? (
            <Image
              source={{ uri: currentTrack.thumbnail || currentTrack.artwork }}
              style={[styles.thumbnail, customStyles.thumbnail]}
              contentFit="cover"
            />
          ) : null}
          <View style={styles.songInfo}>
            <Text style={[styles.songTitle, customStyles.songTitle]} numberOfLines={1}>
              {currentTrack.title}
            </Text>
            <Text style={[styles.songArtist, customStyles.songArtist]} numberOfLines={1}>
              {currentTrack.artist}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.playerContainer}>
        {showProgressBar && (
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
              {Platform.OS === 'web' ? (
                <TouchableOpacity
                  style={styles.progressBarTouchable}
                  activeOpacity={1}
                  onPress={(e) => {
                    if (isDragging) return;
                    
                    let locationX: number | undefined;
                    const nativeEvent = e.nativeEvent as any;
                    const target = e.currentTarget as any;
                    if (target && target.getBoundingClientRect) {
                      const rect = target.getBoundingClientRect();
                      locationX = nativeEvent.clientX - rect.left;
                    } else {
                      locationX = nativeEvent.locationX;
                    }

                    if (locationX !== undefined) {
                      const seekPos = calculateSeekPosition(locationX);
                      if (seekPos !== null) {
                        seekTo(seekPos);
                      }
                    }
                  }}
                >
                  <View style={[styles.progressBar, customStyles.progressBar]}>
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
              ) : (
                <View style={styles.progressBarTouchable}>
                  <View style={[styles.progressBar, customStyles.progressBar]}>
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
                </View>
              )}
            </View>
          </View>
        )}

        {showTimeDisplay && (
          <View style={styles.timeContainer}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        )}

        {showControlButtons && (
          <View style={styles.controlsContainer}>
            <TouchableOpacity style={[styles.controlButton, customStyles.controlButton]}>
              <Ionicons name="shuffle" size={24} color={Theme.text.secondary} />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.controlButton, customStyles.controlButton]}>
              <Ionicons name="play-skip-back" size={28} color={Theme.text.primary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[
                styles.playButton,
                customStyles.playButton,
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

            <TouchableOpacity style={[styles.controlButton, customStyles.controlButton]}>
              <Ionicons name="play-skip-forward" size={28} color={Theme.text.primary} />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.controlButton, customStyles.controlButton]}>
              <Ionicons name="repeat" size={24} color={Theme.text.secondary} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
});

AudioTrack.displayName = 'AudioTrack';

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  nowPlayingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.background.nav,
    marginHorizontal: 20,
    marginTop: 16,
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
});

export default AudioTrack;
