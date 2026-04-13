import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useAuthStore } from '../store/authStore';
import { Colors, Typography } from '../utils/theme';

// Auth screens
import { WelcomeScreen } from '../screens/Auth/WelcomeScreen';
import { LoginScreen } from '../screens/Auth/LoginScreen';
import { RegisterScreen } from '../screens/Auth/RegisterScreen';

// Main screens
import { ChatListScreen } from '../screens/Chat/ChatListScreen';
import { ChatRoomScreen } from '../screens/Chat/ChatRoomScreen';
import { NewChatScreen } from '../screens/Chat/NewChatScreen';
import { WalletScreen } from '../screens/Wallet/WalletScreen';
import { ProfileScreen } from '../screens/Profile/ProfileScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// ─── Bottom Tab Navigator ────────────────────────────────────────────────────
const MainTabs: React.FC = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: Colors.surface,
        borderTopColor: Colors.borderSubtle,
        borderTopWidth: 1,
        paddingBottom: 4,
        height: 56,
      },
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: Colors.textMuted,
      tabBarLabelStyle: {
        fontFamily: Typography.fontFamily.mono,
        fontSize: 10,
        letterSpacing: 0.5,
      },
      tabBarIcon: ({ color, focused }) => {
        const icons: Record<string, string> = {
          Chats: '💬',
          Wallet: '⚡',
          Profile: '◉',
        };
        const icon = icons[route.name] ?? '•';
        return (
          <View style={[
            tabIconStyles.container,
            focused && tabIconStyles.active,
          ]}>
            <React.Fragment>{icon}</React.Fragment>
          </View>
        );
      },
    })}
  >
    <Tab.Screen name="Chats" component={ChatListScreen} />
    <Tab.Screen name="Wallet" component={WalletScreen} />
    <Tab.Screen name="Profile" component={ProfileScreen} />
  </Tab.Navigator>
);

const tabIconStyles = StyleSheet.create({
  container: {
    width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  active: {},
});

// ─── Root Navigator ──────────────────────────────────────────────────────────
const AppNavigator: React.FC = () => {
  const { status, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  // Splash / loading state
  if (status === 'idle' || status === 'initializing') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const isAuth = status === 'authenticated';

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: Colors.background },
          animationEnabled: true,
        }}
      >
        {isAuth ? (
          // ── Authenticated stack ──────────────────────────────────────────
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="ChatRoom" component={ChatRoomScreen} />
            <Stack.Screen name="NewChat" component={NewChatScreen} />
          </>
        ) : (
          // ── Auth stack ───────────────────────────────────────────────────
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AppNavigator;
