import { ActivityIndicator, View } from 'react-native';
import {
  LinkingOptions,
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { PushNotificationData } from '@construct/shared';
import { useAuthStore } from '../store/useAuthStore';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ProjectListScreen } from '../screens/ProjectListScreen';
import { CreateProjectScreen } from '../screens/CreateProjectScreen';
import { ProjectDetailScreen } from '../screens/ProjectDetailScreen';
import { GuidelineScreen } from '../screens/GuidelineScreen';
import { TaskListScreen } from '../screens/TaskListScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { CreateTaskScreen } from '../screens/CreateTaskScreen';
import { SuggestionsScreen } from '../screens/SuggestionsScreen';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type AppStackParamList = {
  ProjectList: undefined;
  CreateProject: undefined;
  ProjectDetail: { projectId: string; name?: string };
  Guideline: { projectId: string };
  Tasks: { projectId: string };
  TaskDetail: { projectId: string; taskId: string };
  CreateTask: { projectId: string };
  Suggestions: { projectId: string };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

export const navigationRef = createNavigationContainerRef<AppStackParamList>();

/**
 * Deep links (constructcoordinator:// — invite emails and notification taps
 * both resolve to these paths).
 */
const linking: LinkingOptions<AppStackParamList> = {
  prefixes: ['constructcoordinator://'],
  config: {
    screens: {
      ProjectDetail: 'project/:projectId',
      Suggestions: 'project/:projectId/suggestions',
      TaskDetail: 'project/:projectId/task/:taskId',
    },
  },
};

/** Routes a tapped push notification to the relevant screen. */
export function navigateFromNotification(data: PushNotificationData): void {
  if (!navigationRef.isReady()) {
    return; // cold start before the navigator mounts — the retry is the user's tap history
  }
  switch (data.type) {
    case 'invite':
      navigationRef.navigate('ProjectDetail', {
        projectId: data.projectId,
        name: data.projectName,
      });
      break;
    case 'suggestion':
      navigationRef.navigate('Suggestions', { projectId: data.projectId });
      break;
    case 'task-blocked':
    case 'submission':
      if (data.taskId) {
        navigationRef.navigate('TaskDetail', {
          projectId: data.projectId,
          taskId: data.taskId,
        });
      }
      break;
  }
}

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
    <NavigationContainer ref={navigationRef} linking={linking}>
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
            // name is absent when arriving via deep link / notification tap.
            options={({ route }) => ({ title: route.params.name ?? 'Project' })}
          />
          <AppStack.Screen
            name="Guideline"
            component={GuidelineScreen}
            options={{ title: 'Guideline' }}
          />
          <AppStack.Screen
            name="Tasks"
            component={TaskListScreen}
            options={{ title: 'Tasks' }}
          />
          <AppStack.Screen
            name="TaskDetail"
            component={TaskDetailScreen}
            options={{ title: 'Task' }}
          />
          <AppStack.Screen
            name="CreateTask"
            component={CreateTaskScreen}
            options={{ title: 'New task' }}
          />
          <AppStack.Screen
            name="Suggestions"
            component={SuggestionsScreen}
            options={{ title: 'AI suggestions' }}
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
