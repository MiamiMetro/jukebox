import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { Theme } from "../constants/theme";

export default function WebNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = Dimensions.get('window');
  const isMobile = width < 768;

  const navItems = [
    { name: 'Rooms', path: '/(tabs)', icon: 'people' },
    { name: 'Create', path: '/(tabs)/create', icon: 'add-circle' },
    { name: 'Settings', path: '/(tabs)/settings', icon: 'settings' },
  ];

  if (Platform.OS !== 'web') return null;

  return (
    <View style={styles.navbar}>
      <View style={styles.navContent}>
        <Text style={styles.logo}>Jukebox</Text>
        <View style={styles.navLinks}>
          {navItems.map((item: any) => (
            <TouchableOpacity
              key={item.path}
              style={[
                styles.navItem,
                pathname === item.path ? styles.navItemActive : null
              ]}
              onPress={() => router.push(item.path as any)}
            >
              <Ionicons 
                name={item.icon as any} 
                size={isMobile ? 24 : 20} 
                color={pathname === item.path ? Theme.accent.primary : Theme.text.muted} 
              />
              {!isMobile && (
                <Text style={[
                  styles.navText,
                  pathname === item.path && styles.navTextActive
                ]}>
                  {item.name}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navbar: {
    backgroundColor: Theme.background.nav,
    borderBottomWidth: 1,
    borderBottomColor: Theme.background.border,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: Theme.shadow.color,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: Theme.shadow.opacity,
    shadowRadius: Theme.shadow.radius,
    elevation: 4,
  },
  navContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Theme.text.primary,
    letterSpacing: 1,
  },
  navLinks: {
    flexDirection: 'row',
    gap: 8,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    minWidth: 44, // Ensure touch target size on mobile
  },
  navItemActive: {
    backgroundColor: Theme.background.navActive,
  },
  navText: {
    fontSize: 16,
    color: Theme.text.secondary,
    fontWeight: '500',
  },
  navTextActive: {
    color: Theme.accent.primary,
    fontWeight: '600',
  },
});
