import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/useAuthStore';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ProjectListScreen } from '../screens/ProjectListScreen';
import { CreateProjectScreen } from '../screens/CreateProjectScreen';
import { ProjectDetailScreen } from '../screens/ProjectDetailScreen';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type AppStackParamList = {
  ProjectList: undefined;
  CreateProject: undefined;
  ProjectDetail: { projectId: string; name: string };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

export function RootNavigator() {
  const status = useAuthStore((s) => s.status);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {status === 'authenticated' ? (
        <AppStack.Navigator>
          <AppStack.Screen
            name="ProjectList"
            component={ProjectListScreen}
            options={{ title: 'Projects' }}
          />
          <AppStack.Screen
            name="CreateProject"
            component={CreateProjectScreen}
            options={{ title: 'New project' }}
          />
          <AppStack.Screen
            name="ProjectDetail"
            component={ProjectDetailScreen}
            options={({ route }) => ({ title: route.params.name })}
          />
        </AppStack.Navigator>
      ) : (
        <AuthStack.Navigator>
          <AuthStack.Screen
            name="Login"
            component={LoginScreen}
            options={{ title: 'Sign in' }}
          />
          <AuthStack.Screen
            name="Register"
            component={RegisterScreen}
            options={{ title: 'Create account' }}
          />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
