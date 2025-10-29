import { View, Text, StyleSheet, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebNav from "../../../components/WebNav";
import TrackPlayer from "../../../components/TrackPlayer";
import { Theme } from "../../../constants/theme";
import { useLocalSearchParams, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function RoomDetail() {
  const { id } = useLocalSearchParams();

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
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.canvas}>
            <View style={styles.canvasContent}>
              <Ionicons name="musical-notes" size={64} color={Theme.accent.primary} />
              <Text style={styles.canvasText}>Room {id}</Text>
              <Text style={styles.canvasSubtext}>Music player</Text>
              
              {Platform.OS !== 'web' && <TrackPlayer />}
              
              {Platform.OS === 'web' && (
                <Text style={styles.webMessage}>
                  Track player is only available on mobile
                </Text>
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: Platform.OS === 'web' ? 20 : 0,
  },
  canvas: {
    backgroundColor: Theme.background.nav,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.background.border,
    padding: 20,
  },
  canvasContent: {
    alignItems: 'center',
    padding: 20,
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
    marginBottom: 20,
  },
  webMessage: {
    color: Theme.text.muted,
    fontSize: 14,
    marginTop: 20,
    fontStyle: 'italic',
  },
});

