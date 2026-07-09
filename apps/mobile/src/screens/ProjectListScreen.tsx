import { useCallback, useEffect } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../navigation/RootNavigator';
import { useAuthStore } from '../store/useAuthStore';
import { useProjectsStore } from '../store/useProjectsStore';
import { Button, RoleBadge, colors } from '../components/ui';

type Props = NativeStackScreenProps<AppStackParamList, 'ProjectList'>;

export function ProjectListScreen({ navigation }: Props) {
  const logout = useAuthStore((s) => s.logout);
  const { projects, loading, fetchProjects } = useProjectsStore();

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Text style={styles.logout} onPress={() => void logout()}>
          Log out
        </Text>
      ),
    });
  }, [navigation, logout]);

  const load = useCallback(() => {
    void fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    load();
    // Refresh when returning from CreateProject / ProjectDetail.
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation, load]);

  return (
    <View style={styles.container}>
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={projects.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No projects yet. Create one, or ask a project owner to invite you.
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              navigation.navigate('ProjectDetail', { projectId: item.id, name: item.name })
            }
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <RoleBadge role={item.myRole} />
            </View>
            <Text style={styles.cardGoal} numberOfLines={2}>
              {item.goal}
            </Text>
          </TouchableOpacity>
        )}
      />
      <View style={styles.footer}>
        <Button title="New project" onPress={() => navigation.navigate('CreateProject')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  logout: { color: colors.primary, fontWeight: '600' },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { textAlign: 'center', color: colors.muted, paddingHorizontal: 32 },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text, flexShrink: 1 },
  cardGoal: { marginTop: 6, color: colors.muted },
  footer: { padding: 16 },
});
