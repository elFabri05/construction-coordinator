import { create } from 'zustand';
import axios from 'axios';
import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import type { SubmissionDto, UploadUrlDto } from '@construct/shared';
import { api } from '../api/client';
import {
  PendingSubmission,
  enqueueSubmission,
  loadQueue,
  removePending,
  updatePending,
} from '../api/submissionQueue';

const isNetworkError = (error: unknown): boolean =>
  axios.isAxiosError(error) && !error.response;

/** PUT a local file straight to the presigned URL (never through our API). */
async function uploadToStorage(
  uploadUrl: string,
  fileUri: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const task = FileSystem.createUploadTask(
    uploadUrl,
    fileUri,
    {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': 'image/jpeg' },
    },
    (progress) => {
      if (onProgress && progress.totalBytesExpectedToSend > 0) {
        onProgress(progress.totalBytesSent / progress.totalBytesExpectedToSend);
      }
    },
  );
  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(`Photo upload failed (HTTP ${result?.status ?? 'network error'})`);
  }
}

interface SubmissionsState {
  submissionsByTask: Record<string, SubmissionDto[]>;
  pendingByTask: Record<string, PendingSubmission[]>;
  /** pending item id -> 0..1 photo upload progress */
  uploadProgress: Record<string, number>;

  hydrateQueue: () => Promise<void>;
  fetchSubmissions: (projectId: string, taskId: string) => Promise<void>;
  /** Socket event handler — prepend a live submission to the feed. */
  applyRealtimeSubmission: (submission: SubmissionDto) => void;
  addSubmission: (
    projectId: string,
    taskId: string,
    input: { comment: string | null; photoUri: string | null; thumbnailUri: string | null },
  ) => Promise<void>;
  deleteSubmission: (projectId: string, taskId: string, submissionId: string) => Promise<void>;
  drainQueue: () => Promise<void>;
}

let draining = false;

export const useSubmissionsStore = create<SubmissionsState>((set, get) => {
  const setPendingFromQueue = (queue: PendingSubmission[]) => {
    const pendingByTask: Record<string, PendingSubmission[]> = {};
    for (const item of queue) {
      (pendingByTask[item.taskId] ??= []).push(item);
    }
    set({ pendingByTask });
  };

  const setProgress = (id: string, fraction: number) =>
    set((state) => ({ uploadProgress: { ...state.uploadProgress, [id]: fraction } }));

  /**
   * Uploads (photo → thumbnail) then creates the record. Each successful PUT
   * checkpoints its object key into the persisted item, so a failure after
   * the photo upload retries only the remaining steps — the photo is never
   * re-uploaded.
   */
  const processPending = async (item: PendingSubmission): Promise<void> => {
    let { uploadedPhotoKey, uploadedThumbnailKey } = item;
    const urlFor = () =>
      api.post<UploadUrlDto>(
        `/projects/${item.projectId}/tasks/${item.taskId}/submissions/upload-url`,
        { contentType: 'image/jpeg' },
      );

    if (item.localPhotoUri && !uploadedPhotoKey) {
      const { data } = await urlFor();
      await uploadToStorage(data.uploadUrl, item.localPhotoUri, (f) => setProgress(item.id, f));
      uploadedPhotoKey = data.objectKey;
      await updatePending(item.id, { uploadedPhotoKey });
    }

    if (item.localThumbnailUri && !uploadedThumbnailKey) {
      const { data } = await urlFor();
      await uploadToStorage(data.uploadUrl, item.localThumbnailUri);
      uploadedThumbnailKey = data.objectKey;
      await updatePending(item.id, { uploadedThumbnailKey });
    }

    await api.post(`/projects/${item.projectId}/tasks/${item.taskId}/submissions`, {
      comment: item.comment ?? undefined,
      photoKey: uploadedPhotoKey ?? undefined,
      thumbnailKey: uploadedThumbnailKey ?? undefined,
    });

    await removePending(item.id);
  };

  return {
    submissionsByTask: {},
    pendingByTask: {},
    uploadProgress: {},

    async hydrateQueue() {
      setPendingFromQueue(await loadQueue());
    },

    applyRealtimeSubmission(submission) {
      set((state) => {
        const existing = state.submissionsByTask[submission.taskId];
        if (!existing) {
          return state; // feed not loaded — it'll be fetched fresh when opened
        }
        // Dedupe: our own submissions come back over the socket too, and may
        // already be in the list from the post-upload refetch. (Optimistic
        // offline items live in pendingByTask under a local id and are
        // removed by the queue drain, so id-dedupe here is sufficient.)
        if (existing.some((s) => s.id === submission.id)) {
          return state;
        }
        return {
          ...state,
          submissionsByTask: {
            ...state.submissionsByTask,
            [submission.taskId]: [submission, ...existing], // feed is newest-first
          },
        };
      });
    },

    async fetchSubmissions(projectId, taskId) {
      const { data } = await api.get<SubmissionDto[]>(
        `/projects/${projectId}/tasks/${taskId}/submissions`,
      );
      set((state) => ({
        submissionsByTask: { ...state.submissionsByTask, [taskId]: data },
      }));
      // We evidently have connectivity — try to drain anything queued.
      void get().drainQueue();
    },

    async addSubmission(projectId, taskId, input) {
      // Queue first: instant feedback in the feed, and nothing is lost if
      // connectivity drops mid-flow.
      const item = await enqueueSubmission({
        projectId,
        taskId,
        comment: input.comment,
        photoUri: input.photoUri,
        thumbnailUri: input.thumbnailUri,
      });
      setPendingFromQueue(await loadQueue());

      try {
        await processPending(item);
        await get().fetchSubmissions(projectId, taskId);
      } catch (error) {
        if (isNetworkError(error) || error instanceof Error && !axios.isAxiosError(error)) {
          // Offline / storage unreachable: stays queued, retried on reconnect.
          return;
        }
        // The server rejected it — retrying verbatim can't succeed.
        await removePending(item.id);
        throw error;
      } finally {
        setPendingFromQueue(await loadQueue());
      }
    },

    async deleteSubmission(projectId, taskId, submissionId) {
      await api.delete(`/projects/${projectId}/tasks/${taskId}/submissions/${submissionId}`);
      set((state) => ({
        submissionsByTask: {
          ...state.submissionsByTask,
          [taskId]: (state.submissionsByTask[taskId] ?? []).filter(
            (s) => s.id !== submissionId,
          ),
        },
      }));
    },

    async drainQueue() {
      if (draining) {
        return;
      }
      draining = true;
      try {
        const queue = await loadQueue();
        const refreshTasks = new Set<string>();
        for (const item of queue) {
          try {
            await processPending(item);
            refreshTasks.add(`${item.projectId}:${item.taskId}`);
          } catch (error) {
            if (isNetworkError(error)) {
              break; // still offline — stop, NetInfo will retrigger us
            }
            if (axios.isAxiosError(error)) {
              await removePending(item.id); // server said no — drop it
            }
            // Non-axios errors (e.g. storage PUT hiccup): keep queued.
          }
        }
        setPendingFromQueue(await loadQueue());
        for (const key of refreshTasks) {
          const [projectId, taskId] = key.split(':');
          const { data } = await api.get<SubmissionDto[]>(
            `/projects/${projectId}/tasks/${taskId}/submissions`,
          );
          set((state) => ({
            submissionsByTask: { ...state.submissionsByTask, [taskId]: data },
          }));
        }
      } finally {
        draining = false;
      }
    },
  };
});

// Background retry: whenever connectivity comes back, drain the queue.
NetInfo.addEventListener((state) => {
  if (state.isConnected) {
    void useSubmissionsStore.getState().drainQueue();
  }
});
