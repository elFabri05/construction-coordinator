import { create } from 'zustand';
import type { AiSuggestionDto, AiSuggestionReviewStatus } from '@construct/shared';
import { api } from '../api/client';

/**
 * Pending AI suggestions per project. Owner/superuser only — the endpoints
 * 403 for members, so callers must gate on role before fetching (see
 * useProjectRole). Counts refresh on fetch; no polling/push in this phase.
 */
interface SuggestionsState {
  suggestionsByProject: Record<string, AiSuggestionDto[]>;
  // undefined = not fetched yet (hide the badge rather than showing 0).
  pendingCountByProject: Record<string, number>;

  fetchPendingSuggestions: (projectId: string) => Promise<void>;
  /** Socket event handler — bump the badge and prepend if the list is loaded. */
  applyRealtimeSuggestion: (suggestion: AiSuggestionDto) => void;
  reviewSuggestion: (
    projectId: string,
    suggestionId: string,
    status: AiSuggestionReviewStatus,
  ) => Promise<void>;
}

export const useSuggestionsStore = create<SuggestionsState>((set, get) => ({
  suggestionsByProject: {},
  pendingCountByProject: {},

  async fetchPendingSuggestions(projectId) {
    const { data } = await api.get<AiSuggestionDto[]>(
      `/projects/${projectId}/suggestions`,
      { params: { status: 'pending' } },
    );
    set((state) => ({
      suggestionsByProject: { ...state.suggestionsByProject, [projectId]: data },
      pendingCountByProject: { ...state.pendingCountByProject, [projectId]: data.length },
    }));
  },

  applyRealtimeSuggestion(suggestion) {
    // The server only sends this event to owner/superuser sockets.
    set((state) => {
      const projectId = suggestion.projectId;
      const existing = state.suggestionsByProject[projectId];
      if (existing?.some((s) => s.id === suggestion.id)) {
        return state;
      }
      const list = existing ? [suggestion, ...existing] : undefined;
      return {
        ...state,
        ...(list
          ? { suggestionsByProject: { ...state.suggestionsByProject, [projectId]: list } }
          : {}),
        pendingCountByProject: {
          ...state.pendingCountByProject,
          [projectId]: list
            ? list.length
            : (state.pendingCountByProject[projectId] ?? 0) + 1,
        },
      };
    });
  },

  async reviewSuggestion(projectId, suggestionId, status) {
    await api.patch(`/projects/${projectId}/suggestions/${suggestionId}`, { status });
    const remaining = (get().suggestionsByProject[projectId] ?? []).filter(
      (s) => s.id !== suggestionId,
    );
    set((state) => ({
      suggestionsByProject: { ...state.suggestionsByProject, [projectId]: remaining },
      pendingCountByProject: {
        ...state.pendingCountByProject,
        [projectId]: remaining.length,
      },
    }));
  },
}));
