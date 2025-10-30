import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Theme } from "../../constants/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: 'bottom', // Always bottom for mobile feel
        tabBarActiveTintColor: Theme.accent.primary,
        tabBarInactiveTintColor: Theme.accent.inactive,
        tabBarStyle: Platform.OS === 'web' 
          ? { display: 'none' } 
          : {
              backgroundColor: Theme.background.nav,
              borderTopColor: Theme.background.border,
              borderTopWidth: 1,
            },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Rooms',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="room/[id]"
        options={{
          href: null, // Hide from tab bar - use native navigation
          headerShown: false, // Explicitly hide header on all platforms
          title: '', // No title
        }}
      />
    </Tabs>
  );
}
