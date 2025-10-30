import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { setupTrackPlayer } from "../services/trackPlayerService";

export default function RootLayout() {
  useEffect(() => {
    // Setup TrackPlayer on app start (native only)
    if (Platform.OS !== 'web') {
      setupTrackPlayer().catch(console.error);
    }
  }, []);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
