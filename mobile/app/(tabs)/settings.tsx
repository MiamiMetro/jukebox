import { View, Text, StyleSheet } from "react-native";
import WebNav from "../../components/WebNav";
import { Theme } from "../../constants/theme";

export default function Settings() {
  return (
    <View style={styles.container}>
      <WebNav />
      <View style={styles.content}>
        <Text style={styles.text}>Settings</Text>
        <Text style={styles.subtext}>Your canvas to work on</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background.primary,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: Theme.text.primary,
    fontSize: 32,
    fontWeight: 'bold',
  },
  subtext: {
    color: Theme.text.secondary,
    fontSize: 16,
    marginTop: 8,
  },
});
