import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebNav from "../../components/WebNav";
import { Theme } from "../../constants/theme";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function Rooms() {
  const router = useRouter();

  const rooms = [
    { id: '1', name: 'Chill Vibes', description: 'Relaxing beats for your day', users: 3 },
  ];

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? [] : ['top']}>
      {Platform.OS === 'web' && <WebNav />}
      <View style={styles.content}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Theme.text.muted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchBar}
            placeholder="Search rooms..."
            placeholderTextColor={Theme.text.muted}
            autoCapitalize="none"
          />
        </View>
        <ScrollView style={styles.roomsList} contentContainerStyle={styles.roomsListContent}>
          {rooms.map((room) => (
            <TouchableOpacity
              key={room.id}
              style={styles.roomCard}
              onPress={() => router.push(`/(tabs)/room/${room.id}` as any)}
            >
              <View style={styles.roomIcon}>
                <Ionicons name="musical-notes" size={32} color={Theme.accent.primary} />
              </View>
              <View style={styles.roomInfo}>
                <Text style={styles.roomName}>{room.name}</Text>
                <Text style={styles.roomDescription}>{room.description}</Text>
                <View style={styles.roomMeta}>
                  <Ionicons name="people" size={16} color={Theme.text.muted} />
                  <Text style={styles.roomUsers}>{room.users} active</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={24} color={Theme.text.muted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 20 : 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.background.nav,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Theme.background.border,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchBar: {
    flex: 1,
    color: Theme.text.primary,
    fontSize: 16,
    padding: 0,
  },
  roomsList: {
    flex: 1,
  },
  roomsListContent: {
    gap: 16,
    paddingBottom: 20,
  },
  roomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.background.nav,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.background.border,
  },
  roomIcon: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: Theme.background.navActive,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    color: Theme.text.primary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  roomDescription: {
    color: Theme.text.secondary,
    fontSize: 14,
    marginBottom: 8,
  },
  roomMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roomUsers: {
    color: Theme.text.muted,
    fontSize: 12,
  },
});
