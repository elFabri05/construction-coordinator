import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../navigation/RootNavigator';
import { useTasksStore } from '../store/useTasksStore';
import { apiErrorMessage } from '../api/client';
import { Button, ErrorText, Field, colors } from '../components/ui';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateTask'>;

// Reached only via the owner/superuser-only button on TaskListScreen; the
// backend guard rejects members even if they get here somehow.
export function CreateTaskScreen({ route, navigation }: Props) {
  const { projectId } = route.params;
  const createTask = useTasksStore((s) => s.createTask);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await createTask(projectId, {
        title: title.trim(),
        description: description.trim() || undefined,
      });
      navigation.goBack();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ErrorText>{error}</ErrorText>
      <Field
        label="Title"
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Pour the concrete base"
      />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Details, acceptance criteria, safety notes…"
        multiline
        numberOfLines={5}
        style={styles.descriptionInput}
      />
      <Button
        title="Create task"
        onPress={submit}
        loading={loading}
        disabled={!title.trim()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.background },
  descriptionInput: { minHeight: 110, textAlignVertical: 'top' },
});
