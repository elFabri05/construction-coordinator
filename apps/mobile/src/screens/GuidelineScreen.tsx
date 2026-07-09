import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LONG_TEXT_MAX_LENGTH } from '@construct/shared';
import { AppStackParamList } from '../navigation/RootNavigator';
import { useTasksStore } from '../store/useTasksStore';
import { useProjectRole } from '../hooks/useProjectRole';
import { apiErrorMessage } from '../api/client';
import { Button, ErrorText, colors } from '../components/ui';

type Props = NativeStackScreenProps<AppStackParamList, 'Guideline'>;

export function GuidelineScreen({ route }: Props) {
  const { projectId } = route.params;

  const guideline = useTasksStore((s) => s.guidelineByProject[projectId]);
  const fetchGuideline = useTasksStore((s) => s.fetchGuideline);
  const saveGuideline = useTasksStore((s) => s.saveGuideline);

  // UI branching only — the backend rejects member writes regardless.
  const myRole = useProjectRole(projectId);
  const canEdit = myRole === 'owner' || myRole === 'superuser';

  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loaded = guideline !== undefined;

  useEffect(() => {
    fetchGuideline(projectId).catch((err) => setError(apiErrorMessage(err)));
  }, [projectId, fetchGuideline]);

  useEffect(() => {
    if (guideline) {
      setDraft(guideline.content);
    }
  }, [guideline]);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await saveGuideline(projectId, draft.trim());
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ErrorText>{error}</ErrorText>

      {guideline ? (
        <Text style={styles.meta}>
          Last updated by {guideline.updatedBy.name} on{' '}
          {new Date(guideline.updatedAt).toLocaleString()}
        </Text>
      ) : null}

      {canEdit ? (
        <View>
          <TextInput
            style={styles.editor}
            multiline
            value={draft}
            onChangeText={setDraft}
            maxLength={LONG_TEXT_MAX_LENGTH}
            placeholder="Site guidelines: safety rules, quality standards, sequencing constraints…"
            placeholderTextColor={colors.muted}
            textAlignVertical="top"
          />
          <Button
            title="Save guideline"
            onPress={save}
            loading={saving}
            disabled={!draft.trim() || draft.trim() === guideline?.content}
          />
        </View>
      ) : loaded && guideline === null ? (
        <Text style={styles.emptyText}>
          No guideline has been written for this project yet.
        </Text>
      ) : (
        <Text style={styles.readOnly}>{guideline?.content ?? ''}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
  meta: { color: colors.muted, fontSize: 13, marginBottom: 12 },
  editor: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    minHeight: 240,
    fontSize: 15,
    color: colors.text,
    marginBottom: 12,
  },
  readOnly: { fontSize: 15, lineHeight: 22, color: colors.text },
  emptyText: { color: colors.muted, textAlign: 'center', marginTop: 32 },
});
