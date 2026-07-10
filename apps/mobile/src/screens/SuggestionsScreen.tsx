import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AiSuggestionDto, AiSuggestionType } from '@construct/shared';
import { AppStackParamList } from '../navigation/RootNavigator';
import { useSuggestionsStore } from '../store/useSuggestionsStore';
import { useTasksStore } from '../store/useTasksStore';
import { apiErrorMessage } from '../api/client';
import { Button, ErrorText, colors } from '../components/ui';

type Props = NativeStackScreenProps<AppStackParamList, 'Suggestions'>;

// Same palette family as the task StatusBadge.
const typeColors: Record<AiSuggestionType, { bg: string; fg: string }> = {
  resequence: { bg: '#e6f0ff', fg: '#1d6ef5' },
  rework: { bg: '#fff2e0', fg: '#b25e09' },
  blocker: { bg: '#fdeaea', fg: '#c22' },
  guideline_conflict: { bg: '#f3e8ff', fg: '#7c3aed' },
  other: { bg: '#eef1f5', fg: '#556' },
};

function TypeBadge({ type }: { type: AiSuggestionType }) {
  const palette = typeColors[type];
  return (
    <View style={[styles.typeBadge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.typeBadgeText, { color: palette.fg }]}>
        {type.replace('_', ' ')}
      </Text>
    </View>
  );
}

/**
 * The AI review queue — owner/superuser only (the nav entry is hidden for
 * members and the API 403s regardless). Accepting/dismissing only records the
 * decision; nothing is auto-applied to tasks or guidelines in this phase.
 */
export function SuggestionsScreen({ route }: Props) {
  const { projectId } = route.params;

  const suggestions = useSuggestionsStore((s) => s.suggestionsByProject[projectId]);
  const fetchPendingSuggestions = useSuggestionsStore((s) => s.fetchPendingSuggestions);
  const reviewSuggestion = useSuggestionsStore((s) => s.reviewSuggestion);

  // Task titles for the "related tasks" line; falls back to ids if not loaded.
  const tasks = useTasksStore((s) => s.tasksByProject[projectId]);
  const fetchTasks = useTasksStore((s) => s.fetchTasks);

  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      await Promise.all([
        fetchPendingSuggestions(projectId),
        fetchTasks(projectId).catch(() => undefined),
      ]);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [projectId, fetchPendingSuggestions, fetchTasks]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const review = async (suggestion: AiSuggestionDto, status: 'accepted' | 'dismissed') => {
    setError(null);
    setBusyId(suggestion.id);
    try {
      await reviewSuggestion(projectId, suggestion.id, status);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const taskTitle = (taskId: string): string =>
    tasks?.find((t) => t.id === taskId)?.title ?? `task ${taskId.slice(0, 8)}…`;

  return (
    <View style={styles.container}>
      <ErrorText>{error}</ErrorText>
      <FlatList
        data={suggestions ?? []}
        keyExtractor={(s) => s.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No pending suggestions — the AI has nothing to flag right now.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <TypeBadge type={item.suggestionType} />
              <Text style={styles.date}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <Text style={styles.summary}>{item.summary}</Text>
            <Text style={styles.detail}>{item.detail}</Text>
            {item.relatedTaskIds.length > 0 ? (
              <Text style={styles.related}>
                Related: {item.relatedTaskIds.map(taskTitle).join(', ')}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <View style={styles.actionButton}>
                <Button
                  title="Accept"
                  onPress={() => void review(item, 'accepted')}
                  loading={busyId === item.id}
                  disabled={busyId !== null && busyId !== item.id}
                />
              </View>
              <View style={styles.actionButton}>
                <Button
                  title="Dismiss"
                  variant="secondary"
                  onPress={() => void review(item, 'dismissed')}
                  disabled={busyId !== null}
                />
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 32 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  typeBadgeText: { fontSize: 12, fontWeight: '700' },
  date: { color: colors.muted, fontSize: 12 },
  summary: { color: colors.text, fontWeight: '600', marginBottom: 6 },
  detail: { color: colors.text, fontSize: 13, lineHeight: 19, marginBottom: 6 },
  related: { color: colors.muted, fontSize: 12, marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1 },
});
