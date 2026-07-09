import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TaskStatus } from '@construct/shared';
import { AppStackParamList } from '../navigation/RootNavigator';
import { useTasksStore } from '../store/useTasksStore';
import { useProjectRole } from '../hooks/useProjectRole';
import { apiErrorMessage } from '../api/client';
import { Button, ErrorText, Field, StatusPicker, colors } from '../components/ui';

type Props = NativeStackScreenProps<AppStackParamList, 'TaskDetail'>;

export function TaskDetailScreen({ route, navigation }: Props) {
  const { projectId, taskId } = route.params;

  const task = useTasksStore((s) =>
    s.tasksByProject[projectId]?.find((t) => t.id === taskId),
  );
  const fetchTasks = useTasksStore((s) => s.fetchTasks);
  const updateTask = useTasksStore((s) => s.updateTask);
  const updateTaskStatus = useTasksStore((s) => s.updateTaskStatus);
  const deleteTask = useTasksStore((s) => s.deleteTask);

  // Members get the status picker only; edit/delete are hidden (and the
  // backend rejects them anyway).
  const myRole = useProjectRole(projectId);
  const canManage = myRole === 'owner' || myRole === 'superuser';

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!task) {
      fetchTasks(projectId).catch((err) => setError(apiErrorMessage(err)));
    }
  }, [task, projectId, fetchTasks]);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
    }
  }, [task?.id]);

  if (!task) {
    return (
      <View style={styles.container}>
        <ErrorText>{error}</ErrorText>
      </View>
    );
  }

  const setStatus = (status: TaskStatus) => {
    setError(null);
    updateTaskStatus(projectId, taskId, status).catch((err) =>
      setError(apiErrorMessage(err)),
    );
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await updateTask(projectId, taskId, {
        title: title.trim(),
        description: description.trim(),
      });
      navigation.goBack();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete task', `Delete "${task.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteTask(projectId, taskId)
            .then(() => navigation.goBack())
            .catch((err) => setError(apiErrorMessage(err)));
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ErrorText>{error}</ErrorText>

      <Text style={styles.sectionLabel}>Status</Text>
      <StatusPicker value={task.status} onChange={setStatus} />

      {canManage ? (
        <View style={styles.editSection}>
          <Field label="Title" value={title} onChangeText={setTitle} />
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            style={styles.descriptionInput}
          />
          <Button title="Save changes" onPress={save} loading={saving} disabled={!title.trim()} />
          <View style={styles.deleteWrapper}>
            <Button title="Delete task" onPress={confirmDelete} variant="danger" />
          </View>
        </View>
      ) : (
        <View style={styles.readSection}>
          <Text style={styles.sectionLabel}>Title</Text>
          <Text style={styles.readTitle}>{task.title}</Text>
          <Text style={styles.sectionLabel}>Description</Text>
          <Text style={styles.readDescription}>
            {task.description || 'No description.'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
  sectionLabel: {
    fontWeight: '700',
    color: colors.text,
    marginTop: 16,
    marginBottom: 6,
  },
  editSection: { marginTop: 8 },
  descriptionInput: { minHeight: 110, textAlignVertical: 'top' },
  deleteWrapper: { marginTop: 12 },
  readSection: { marginTop: 8 },
  readTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  readDescription: { fontSize: 15, lineHeight: 22, color: colors.text },
});
