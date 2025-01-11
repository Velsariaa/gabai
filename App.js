import { StyleSheet, Text, View } from 'react-native';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import LandingScreen from './src/screens/Landing';
import LoginScreen from './src/screens/Login';
import SignUpScreen from './src/screens/SignUp';
import HomeScreen from './src/screens/Home';
import Upload from './src/screens/Upload';
import Flashcards from './src/screens/Flashcards';
import ProfileScreen from './src/screens/ProfileScreen';
import ModeSelect from './src/screens/ModeSelect';

const Stack = createStackNavigator(); 

export default function App() {
  return (
    <NavigationContainer>
      {/* Change this for testing new routes */}
      <Stack.Navigator initialRouteName="Landing"> 
      
        
        <Stack.Screen name="Landing" component={LandingScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="Upload" component={Upload} />
        <Stack.Screen name="Flashcards" component={Flashcards} />
        <Stack.Screen name="ModeSelect" component={ModeSelect} />

      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});