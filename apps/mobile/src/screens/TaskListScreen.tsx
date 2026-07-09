import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TaskDto, TaskStatus } from '@construct/shared';
import { TASK_STATUSES } from '@construct/shared';
import { AppStackParamList } from '../navigation/RootNavigator';
import { useTasksStore } from '../store/useTasksStore';
import { useProjectRole } from '../hooks/useProjectRole';
import { apiErrorMessage } from '../api/client';
import { Button, ErrorText, StatusBadge, StatusPicker, colors } from '../components/ui';

type Props = NativeStackScreenProps<AppStackParamList, 'Tasks'>;
type Filter = TaskStatus | 'all';

export function TaskListScreen({ route, navigation }: Props) {
  const { projectId } = route.params;

  const tasks = useTasksStore((s) => s.tasksByProject[projectId]) ?? [];
  const fetchTasks = useTasksStore((s) => s.fetchTasks);
  const updateTaskStatus = useTasksStore((s) => s.updateTaskStatus);
  const reorderTasks = useTasksStore((s) => s.reorderTasks);

  // UI convenience only; the backend guard is the enforcement.
  const myRole = useProjectRole(projectId);
  const canManage = myRole === 'owner' || myRole === 'superuser';

  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchTasks(projectId).catch((err) => setError(apiErrorMessage(err)));
  }, [projectId, fetchTasks]);

  useEffect(() => {
    load();
    return navigation.addListener('focus', load);
  }, [navigation, load]);

  const visibleTasks =
    filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);

  // Reordering a filtered subset would renumber against the wrong baseline,
  // so dragging is only enabled on the unfiltered list.
  const dragEnabled = canManage && filter === 'all';

  const onDragEnd = ({ data }: { data: TaskDto[] }) => {
    // Optimistic update + rollback on failure live in the store.
    reorderTasks(projectId, data.map((t) => t.id)).catch((err) =>
      setError(apiErrorMessage(err)),
    );
  };

  const setStatus = (task: TaskDto, status: TaskStatus) => {
    setError(null);
    updateTaskStatus(projectId, task.id, status).catch((err) =>
      setError(apiErrorMessage(err)),
    );
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<TaskDto>) => (
    <ScaleDecorator>
      <TouchableOpacity
        style={[styles.card, isActive && styles.cardActive]}
        onPress={() =>
          navigation.navigate('TaskDetail', { projectId, taskId: item.id })
        }
        onLongPress={dragEnabled ? drag : undefined}
        delayLongPress={200}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.sequenceOrder}. {item.title}
          </Text>
          <StatusBadge status={item.status} />
        </View>
        {item.description ? (
          <Text style={styles.cardDescription} numberOfLines={1}>
            {item.description}
          </Text>
        ) : null}
        <View style={styles.quickActions}>
          <StatusPicker value={item.status} onChange={(status) => setStatus(item, status)} />
        </View>
      </TouchableOpacity>
    </ScaleDecorator>
  );

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {(['all', ...TASK_STATUSES] as Filter[]).map((value) => (
          <TouchableOpacity
            key={value}
            onPress={() => setFilter(value)}
            style={[styles.filterChip, filter === value && styles.filterChipActive]}
          >
            <Text
              style={[styles.filterText, filter === value && styles.filterTextActive]}
            >
              {value === 'all' ? 'all' : value.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ErrorText>{error}</ErrorText>
      {dragEnabled ? (
        <Text style={styles.hint}>Long-press a task to drag it into a new order.</Text>
      ) : null}

      <DraggableFlatList
        data={visibleTasks}
        keyExtractor={(t) => t.id}
        onDragEnd={onDragEnd}
        renderItem={renderItem}
        containerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {filter === 'all' ? 'No tasks yet.' : `No ${filter.replace('_', ' ')} tasks.`}
          </Text>
        }
      />

      {/* Hidden entirely for members, not just disabled. */}
      {canManage ? (
        <View style={styles.footer}>
          <Button
            title="New task"
            onPress={() => navigation.navigate('CreateTask', { projectId })}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  filterChipActive: { borderColor: colors.primary, backgroundColor: colors.badge },
  filterText: { color: colors.muted, fontSize: 13 },
  filterTextActive: { color: colors.primary, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  list: { flex: 1 },
  card: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  cardActive: { borderColor: colors.primary, elevation: 4 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, flexShrink: 1 },
  cardDescription: { marginTop: 4, color: colors.muted, fontSize: 13 },
  quickActions: { marginTop: 10 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
  footer: { padding: 16 },
});
