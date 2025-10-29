import { View, Text, StyleSheet, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebNav from "../../../components/WebNav";
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
        <View style={styles.canvas}>
          <View style={styles.canvasContent}>
            <Ionicons name="musical-notes" size={64} color={Theme.accent.primary} />
            <Text style={styles.canvasText}>Your Room Canvas</Text>
            <Text style={styles.canvasSubtext}>Build your music room here</Text>
            <Text style={styles.canvasSubtext}>Room {id}</Text>
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
    marginTop: Platform.OS === 'web' ? 20 : 0,
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

