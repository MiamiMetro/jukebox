import { View, Text, StyleSheet, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRef } from "react";
import WebNav from "../../../components/WebNav";
import { Theme } from "../../../constants/theme";
import { useLocalSearchParams, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AudioTrack, { AudioTrackRef, AudioTrackData } from "../../../components/AudioTrack";

// Temporary song data (in real app, fetch from API)
const currentSong: AudioTrackData = {
  id: '1',
  title: 'Blinding Lights',
  artist: 'The Weeknd',
  thumbnail: 'https://picsum.photos/1000',
  audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
};

export default function RoomDetail() {
  const { id } = useLocalSearchParams();
  const audioTrackRef = useRef<AudioTrackRef>(null);

  // Example: Programmatically control the audio track
  // You can use these methods anywhere:
  // - audioTrackRef.current?.play()
  // - audioTrackRef.current?.pause()
  // - audioTrackRef.current?.seekTo(30000) // Seek to 30 seconds
  // - audioTrackRef.current?.setTrack(newTrack)
  // - const position = audioTrackRef.current?.getPosition()
  // - const duration = audioTrackRef.current?.getDuration()
  // - const isPlaying = audioTrackRef.current?.isPlaying()
  // - const currentTrack = audioTrackRef.current?.getCurrentTrack()

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
        
        {/* Reusable AudioTrack Component */}
        <AudioTrack
          ref={audioTrackRef}
          track={currentSong}
          callbacks={{
            onPlay: () => console.log('Track started playing'),
            onPause: () => console.log('Track paused'),
            onSeek: (position) => console.log('Seeked to:', position),
            onTrackChange: (track) => console.log('Track changed:', track),
            onTrackEnd: () => console.log('Track ended'),
            onLoadingChange: (isLoading) => console.log('Loading:', isLoading),
          }}
        />

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
