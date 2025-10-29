import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Theme } from '../constants/theme';

// Dynamic import with error handling for native modules
let TrackPlayer: any = null;
let State: any = null;
let useTrackPlayerEvents: any = null;
let Event: any = null;
let setupPlayer: any = null;
let addTracks: any = null;

try {
  const trackPlayerModule = require('react-native-track-player');
  TrackPlayer = trackPlayerModule.default;
  State = trackPlayerModule.State;
  useTrackPlayerEvents = trackPlayerModule.useTrackPlayerEvents;
  Event = trackPlayerModule.Event;
  
  const playerService = require('../services/playerService');
  setupPlayer = playerService.setupPlayer;
  addTracks = playerService.addTracks;
} catch (error) {
  // Module not available (e.g., in Expo Go)
  console.log('TrackPlayer not available:', error);
}

export default function TrackPlayerComponent() {
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [playbackState, setPlaybackState] = useState<any>('none');
  const [currentTrack, setCurrentTrack] = useState<any>(null);
  const [moduleAvailable, setModuleAvailable] = useState(true);

  // Only show on mobile
  if (Platform.OS === 'web') {
    return null;
  }

  // Show message if module not available
  if (!TrackPlayer || !moduleAvailable) {
    return (
      <View style={styles.container}>
        <View style={styles.player}>
          <Text style={styles.errorTitle}>Track Player Unavailable</Text>
          <Text style={styles.errorText}>
            This feature requires a development build.{'\n'}
            Track player doesn't work in Expo Go.
          </Text>
          <Text style={styles.errorSubtext}>
            Run: npx expo run:android or npx expo run:ios
          </Text>
        </View>
      </View>
    );
  }

  useEffect(() => {
    if (!TrackPlayer || !setupPlayer || !addTracks) {
      setModuleAvailable(false);
      return;
    }

    let isMounted = true;

    const initializePlayer = async () => {
      try {
        await setupPlayer();
        await addTracks();
        const track = await TrackPlayer.getActiveTrack();
        if (isMounted) {
          setCurrentTrack(track);
          setIsPlayerReady(true);
        }
      } catch (error) {
        console.error('Failed to initialize player:', error);
        if (isMounted) {
          setModuleAvailable(false);
          setIsPlayerReady(true);
        }
      }
    };

    initializePlayer();

    // Get initial state
    try {
      TrackPlayer.getState().then((state: any) => {
        if (isMounted) {
          setPlaybackState(state);
        }
      }).catch(() => {
        setModuleAvailable(false);
      });
    } catch (error) {
      setModuleAvailable(false);
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen to playback state changes
  useEffect(() => {
    if (!useTrackPlayerEvents || !Event || !TrackPlayer) return;

    // Hook must be called unconditionally
    const eventHandler = async (event: any) => {
      if (event.type === Event.PlaybackState) {
        setPlaybackState(event.state);
      }
      if (event.type === Event.PlaybackTrackChanged) {
        try {
          const track = await TrackPlayer.getActiveTrack();
          setCurrentTrack(track);
        } catch (error) {
          console.error('Error getting active track:', error);
        }
      }
    };

    // Use a simple polling approach instead of hooks for conditional module
    const interval = setInterval(async () => {
      try {
        const state = await TrackPlayer.getState();
        setPlaybackState(state);
        const track = await TrackPlayer.getActiveTrack();
        if (track) setCurrentTrack(track);
      } catch (error) {
        // Silent fail
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const togglePlayback = async () => {
    if (!TrackPlayer) return;
    try {
      const state = await TrackPlayer.getState();
      if (state === (State?.Playing || 'playing')) {
        await TrackPlayer.pause();
      } else if (state === (State?.Ready || 'ready') || state === (State?.Paused || 'paused')) {
        await TrackPlayer.play();
      } else {
        await TrackPlayer.play();
      }
    } catch (error) {
      console.error('Playback error:', error);
    }
  };

  const skipToNext = async () => {
    if (!TrackPlayer) return;
    try {
      await TrackPlayer.skipToNext();
    } catch (error) {
      console.error('Skip error:', error);
    }
  };

  const skipToPrevious = async () => {
    if (!TrackPlayer) return;
    try {
      await TrackPlayer.skipToPrevious();
    } catch (error) {
      console.error('Skip error:', error);
    }
  };

  if (!isPlayerReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={Theme.accent.primary} />
        <Text style={styles.loadingText}>Loading player...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.player}>
        {currentTrack?.artwork && (
          <Image
            source={{ uri: currentTrack.artwork }}
            style={styles.artwork}
            contentFit="cover"
          />
        )}
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {currentTrack?.title || 'No track'}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {currentTrack?.artist || 'Unknown artist'}
          </Text>
        </View>
        <View style={styles.controls}>
          <TouchableOpacity onPress={skipToPrevious} style={styles.controlButton}>
            <Ionicons name="play-skip-back" size={24} color={Theme.text.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={togglePlayback}
            style={[styles.controlButton, styles.playButton]}
          >
            <Ionicons
              name={playbackState === (State?.Playing || 'playing') ? 'pause' : 'play'}
              size={32}
              color="#FFFFFF"
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={skipToNext} style={styles.controlButton}>
            <Ionicons name="play-skip-forward" size={24} color={Theme.text.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
  },
  player: {
    width: '100%',
    backgroundColor: Theme.background.nav,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Theme.background.border,
  },
  artwork: {
    width: 200,
    height: 200,
    borderRadius: 12,
    alignSelf: 'center',
    marginBottom: 20,
  },
  trackInfo: {
    alignItems: 'center',
    marginBottom: 24,
  },
  trackTitle: {
    color: Theme.text.primary,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  trackArtist: {
    color: Theme.text.secondary,
    fontSize: 16,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  controlButton: {
    padding: 12,
  },
  playButton: {
    backgroundColor: Theme.accent.primary,
    borderRadius: 32,
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
  },
  loadingText: {
    color: Theme.text.secondary,
    marginTop: 12,
    fontSize: 14,
  },
  errorTitle: {
    color: Theme.text.primary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorText: {
    color: Theme.text.secondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  errorSubtext: {
    color: Theme.text.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
});

