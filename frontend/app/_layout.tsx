import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { Platform } from "react-native";

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== 'web') {
      // Register the playback service - only if module is available
      try {
        const TrackPlayer = require('react-native-track-player').default;
        const { PlaybackService } = require('../services/playerService');
        TrackPlayer.registerPlaybackService(() => PlaybackService);
      } catch (error) {
        // Module not available in Expo Go - silently fail
        console.log('TrackPlayer not available for service registration');
      }
    }
  }, []);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
