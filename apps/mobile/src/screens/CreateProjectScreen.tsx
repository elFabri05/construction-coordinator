import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../navigation/RootNavigator';
import { useProjectsStore } from '../store/useProjectsStore';
import { apiErrorMessage } from '../api/client';
import { Button, ErrorText, Field, colors } from '../components/ui';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateProject'>;

export function CreateProjectScreen({ navigation }: Props) {
  const createProject = useProjectsStore((s) => s.createProject);

  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const project = await createProject(name.trim(), goal.trim());
      navigation.replace('ProjectDetail', { projectId: project.id, name: project.name });
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
        label="Project name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Pool build — Villa Rosa"
      />
      <Field
        label="Goal"
        value={goal}
        onChangeText={setGoal}
        placeholder="What does 'done' look like?"
        multiline
        numberOfLines={4}
        style={styles.goalInput}
      />
      <Button
        title="Create project"
        onPress={submit}
        loading={loading}
        disabled={!name.trim() || !goal.trim()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.background },
  goalInput: { minHeight: 90, textAlignVertical: 'top' },
});
