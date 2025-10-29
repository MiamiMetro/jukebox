import { View, Text, StyleSheet, Platform, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRef } from "react";
import { Image } from "expo-image";
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
  audioUrl: 'https://yhoyscexuxnouexhcndo.supabase.co/storage/v1/object/public/jukebox-tracks/zx6NkXvzrNc.webm',
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

        {/* Now Playing Card */}
        <View style={styles.nowPlayingCard}>
          {currentSong.thumbnail && (
            <Image
              source={{ uri: currentSong.thumbnail }}
              style={styles.thumbnail}
              contentFit="cover"
            />
          )}
          <View style={styles.songInfo}>
            <Text style={styles.songTitle} numberOfLines={1}>{currentSong.title}</Text>
            <Text style={styles.songArtist} numberOfLines={1}>{currentSong.artist}</Text>
          </View>
        </View>

        {/* Reusable AudioTrack Component */}
        <AudioTrack
          ref={audioTrackRef}
          track={currentSong}
          showThumbnail={false}
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
