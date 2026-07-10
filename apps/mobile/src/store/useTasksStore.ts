import { create } from 'zustand';
import axios from 'axios';
import type {
  CreateTaskRequest,
  GuidelineDto,
  TaskDto,
  TaskStatus,
  UpdateTaskRequest,
} from '@construct/shared';
import { api } from '../api/client';
import { enqueueStatusUpdate, flushStatusQueue } from '../api/offlineQueue';

const isNetworkError = (error: unknown): boolean =>
  axios.isAxiosError(error) && !error.response;

interface TasksState {
  tasksByProject: Record<string, TaskDto[]>;
  // null = fetched, project has no guideline yet; undefined = not fetched.
  guidelineByProject: Record<string, GuidelineDto | null>;

  fetchTasks: (projectId: string, status?: TaskStatus) => Promise<void>;
  /** Socket event handler — update (or insert) a task in place, keeping sequence order. */
  applyRealtimeTask: (task: TaskDto) => void;
  createTask: (projectId: string, body: CreateTaskRequest) => Promise<TaskDto>;
  updateTask: (projectId: string, taskId: string, body: UpdateTaskRequest) => Promise<void>;
  updateTaskStatus: (projectId: string, taskId: string, status: TaskStatus) => Promise<void>;
  deleteTask: (projectId: string, taskId: string) => Promise<void>;
  reorderTasks: (projectId: string, taskIds: string[]) => Promise<void>;

  fetchGuideline: (projectId: string) => Promise<void>;
  saveGuideline: (projectId: string, content: string) => Promise<void>;
}

export const useTasksStore = create<TasksState>((set, get) => {
  const setProjectTasks = (projectId: string, tasks: TaskDto[]) =>
    set((state) => ({
      tasksByProject: { ...state.tasksByProject, [projectId]: tasks },
    }));

  const patchLocalTask = (projectId: string, taskId: string, patch: Partial<TaskDto>) =>
    set((state) => ({
      tasksByProject: {
        ...state.tasksByProject,
        [projectId]: (state.tasksByProject[projectId] ?? []).map((t) =>
          t.id === taskId ? { ...t, ...patch } : t,
        ),
      },
    }));

  const sendStatus = (projectId: string, taskId: string, status: TaskStatus) =>
    api.patch(`/projects/${projectId}/tasks/${taskId}/status`, { status });

  return {
    tasksByProject: {},
    guidelineByProject: {},

    async fetchTasks(projectId, status) {
      // Piggyback: whenever we can reach the server, drain the offline queue.
      await flushStatusQueue(
        (u) => sendStatus(u.projectId, u.taskId, u.status).then(() => undefined),
        isNetworkError,
      );

      const { data } = await api.get<TaskDto[]>(`/projects/${projectId}/tasks`, {
        params: status ? { status } : undefined,
      });
      setProjectTasks(projectId, data);
    },

    applyRealtimeTask(task) {
      set((state) => {
        const existing = state.tasksByProject[task.projectId];
        if (!existing) {
          return state; // list not loaded — fetched fresh when opened
        }
        const replaced = existing.some((t) => t.id === task.id)
          ? existing.map((t) => (t.id === task.id ? task : t))
          : [...existing, task];
        replaced.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
        return {
          ...state,
          tasksByProject: { ...state.tasksByProject, [task.projectId]: replaced },
        };
      });
    },

    async createTask(projectId, body) {
      const { data } = await api.post<TaskDto>(`/projects/${projectId}/tasks`, body);
      await get().fetchTasks(projectId);
      return data;
    },

    async updateTask(projectId, taskId, body) {
      const { data } = await api.patch<TaskDto>(
        `/projects/${projectId}/tasks/${taskId}`,
        body,
      );
      patchLocalTask(projectId, taskId, data);
    },

    async updateTaskStatus(projectId, taskId, status) {
      const previous = get()
        .tasksByProject[projectId]?.find((t) => t.id === taskId)?.status;
      patchLocalTask(projectId, taskId, { status });

      try {
        await sendStatus(projectId, taskId, status);
      } catch (error) {
        if (isNetworkError(error)) {
          // Offline: keep the optimistic value and queue for retry.
          await enqueueStatusUpdate({ projectId, taskId, status });
          return;
        }
        // Server rejected it: roll back the optimistic update.
        if (previous) {
          patchLocalTask(projectId, taskId, { status: previous });
        }
        throw error;
      }
    },

    async deleteTask(projectId, taskId) {
      await api.delete(`/projects/${projectId}/tasks/${taskId}`);
      set((state) => ({
        tasksByProject: {
          ...state.tasksByProject,
          [projectId]: (state.tasksByProject[projectId] ?? []).filter(
            (t) => t.id !== taskId,
          ),
        },
      }));
    },

    async reorderTasks(projectId, taskIds) {
      const previous = get().tasksByProject[projectId] ?? [];

      // Optimistic: apply the new order locally right away.
      const byId = new Map(previous.map((t) => [t.id, t]));
      const optimistic = taskIds
        .map((id, index) => {
          const task = byId.get(id);
          return task ? { ...task, sequenceOrder: index + 1 } : null;
        })
        .filter((t): t is TaskDto => t !== null);
      setProjectTasks(projectId, optimistic);

      try {
        const { data } = await api.patch<TaskDto[]>(
          `/projects/${projectId}/tasks/reorder`,
          { taskIds },
        );
        setProjectTasks(projectId, data);
      } catch (error) {
        // Roll back to the server-confirmed order.
        setProjectTasks(projectId, previous);
        throw error;
      }
    },

    async fetchGuideline(projectId) {
      try {
        const { data } = await api.get<GuidelineDto>(`/projects/${projectId}/guideline`);
        set((state) => ({
          guidelineByProject: { ...state.guidelineByProject, [projectId]: data },
        }));
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          set((state) => ({
            guidelineByProject: { ...state.guidelineByProject, [projectId]: null },
          }));
          return;
        }
        throw error;
      }
    },

    async saveGuideline(projectId, content) {
      const { data } = await api.put<GuidelineDto>(
        `/projects/${projectId}/guideline`,
        { content },
      );
      set((state) => ({
        guidelineByProject: { ...state.guidelineByProject, [projectId]: data },
      }));
    },
  };
});
