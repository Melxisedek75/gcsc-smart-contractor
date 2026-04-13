import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useAuthStore } from '../store/authStore';
import { notificationService } from '../services/notificationService';
import { Colors, Typography } from '../utils/theme';

// Auth
import { WelcomeScreen } from '../screens/Auth/WelcomeScreen';
import { LoginScreen } from '../screens/Auth/LoginScreen';
import { RegisterScreen } from '../screens/Auth/RegisterScreen';

// Chat
import { ChatListScreen } from '../screens/Chat/ChatListScreen';
import { ChatRoomScreen } from '../screens/Chat/ChatRoomScreen';
import { NewChatScreen } from '../screens/Chat/NewChatScreen';
import { ChannelsScreen } from '../screens/Chat/ChannelsScreen';
import { GroupInfoScreen } from '../screens/Chat/GroupInfoScreen';

// Wallet
import { WalletScreen } from '../screens/Wallet/WalletScreen';
import { SendTokenScreen } from '../screens/Wallet/SendTokenScreen';
import { TransactionHistoryScreen } from '../screens/Wallet/TransactionHistoryScreen';

// Profile
import { ProfileScreen } from '../screens/Profile/ProfileScreen';

// ─── Navigation Theme ─────────────────────────────────────────────────────────
const XPRTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.primary,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.textPrimary,
    border: Colors.borderSubtle,
    notification: Colors.primary,
  },
};

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// ─── Tab bar icon ─────────────────────────────────────────────────────────────
const TabIcon: React.FC<{
  icon: string;
  focused: boolean;
  label: string;
}> = ({ icon, focused }) => (
  <View style={[tabStyles.icon, focused && tabStyles.iconActive]}>
    <Text style={tabStyles.iconText}>{icon}</Text>
  </View>
);

const tabStyles = StyleSheet.create({
  icon: {
    width: 30, height: 30,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 8,
  },
  iconActive: {
    backgroundColor: Colors.primaryDim,
  },
  iconText: { fontSize: 18 },
});

// ─── Bottom Tab Navigator ─────────────────────────────────────────────────────
const MainTabs: React.FC = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: Colors.surface,
        borderTopColor: Colors.borderSubtle,
        borderTopWidth: 1,
        height: 60,
        paddingBottom: 6,
        paddingTop: 4,
      },
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: Colors.textMuted,
      tabBarLabelStyle: {
        fontFamily: Typography.fontFamily.mono,
        fontSize: 9,
        letterSpacing: 0.5,
      },
      tabBarIcon: ({ focused }) => {
        const icons: Record<string, string> = {
          Chats: '💬',
          Wallet: '⚡',
          Profile: '◉',
        };
        return (
          <TabIcon
            icon={icons[route.name] ?? '•'}
            focused={focused}
            label={route.name}
          />
        );
      },
    })}
  >
    <Tab.Screen name="Chats" component={ChatListScreen} />
    <Tab.Screen name="Wallet" component={WalletScreen} />
    <Tab.Screen name="Profile" component={ProfileScreen} />
  </Tab.Navigator>
);

// ─── Root Navigator ───────────────────────────────────────────────────────────
const AppNavigator: React.FC = () => {
  const { status, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
    notificationService.initialize();
  }, []);

  if (status === 'idle' || status === 'initializing') {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingBrand}>XPR Chat</Text>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 24 }} />
      </View>
    );
  }

  const isAuth = status === 'authenticated';

  return (
    <NavigationContainer theme={XPRTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: Colors.background },
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      >
        {isAuth ? (
          <>
            {/* Main tabs */}
            <Stack.Screen name="Main" component={MainTabs} />

            {/* Chat */}
            <Stack.Screen name="ChatRoom" component={ChatRoomScreen} />
            <Stack.Screen name="NewChat" component={NewChatScreen} />
            <Stack.Screen name="Channels" component={ChannelsScreen} />
            <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />

            {/* Wallet */}
            <Stack.Screen name="SendToken" component={SendTokenScreen} />
            <Stack.Screen name="TransactionHistory" component={TransactionHistoryScreen} />
          </>
        ) : (
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
  loadingBrand: {
    fontSize: 32,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
    letterSpacing: 4,
  },
});

export default AppNavigator;
