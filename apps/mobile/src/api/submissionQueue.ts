import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

// Durable offline queue for submissions (the real version of the Phase 2
// placeholder). Queue metadata lives in AsyncStorage; photo/thumbnail files
// are COPIED into the app's document directory so they survive the picker
// cache being cleared and app restarts.

const QUEUE_KEY = 'cc.pendingSubmissions';
const PENDING_DIR = `${FileSystem.documentDirectory}pending-submissions/`;

export interface PendingSubmission {
  id: string;
  projectId: string;
  taskId: string;
  comment: string | null;
  localPhotoUri: string | null;
  localThumbnailUri: string | null;
  /**
   * Set as soon as the photo PUT succeeds. On retry after a partial failure
   * (photo uploaded but the submission POST failed) we reuse this key and
   * skip the re-upload.
   */
  uploadedPhotoKey: string | null;
  uploadedThumbnailKey: string | null;
  createdAt: string;
}

function localId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadQueue(): Promise<PendingSubmission[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as PendingSubmission[];
  } catch {
    return [];
  }
}

async function saveQueue(queue: PendingSubmission[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function persistFile(uri: string, id: string, suffix: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(PENDING_DIR, { intermediates: true }).catch(() => undefined);
  const target = `${PENDING_DIR}${id}-${suffix}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}

export async function enqueueSubmission(input: {
  projectId: string;
  taskId: string;
  comment: string | null;
  photoUri: string | null;
  thumbnailUri: string | null;
}): Promise<PendingSubmission> {
  const id = localId();
  const item: PendingSubmission = {
    id,
    projectId: input.projectId,
    taskId: input.taskId,
    comment: input.comment,
    localPhotoUri: input.photoUri ? await persistFile(input.photoUri, id, 'photo') : null,
    localThumbnailUri: input.thumbnailUri
      ? await persistFile(input.thumbnailUri, id, 'thumb')
      : null,
    uploadedPhotoKey: null,
    uploadedThumbnailKey: null,
    createdAt: new Date().toISOString(),
  };

  const queue = await loadQueue();
  await saveQueue([...queue, item]);
  return item;
}

export async function updatePending(
  id: string,
  patch: Partial<PendingSubmission>,
): Promise<PendingSubmission | undefined> {
  const queue = await loadQueue();
  let updated: PendingSubmission | undefined;
  const next = queue.map((item) => {
    if (item.id !== id) {
      return item;
    }
    updated = { ...item, ...patch };
    return updated;
  });
  await saveQueue(next);
  return updated;
}

export async function removePending(id: string): Promise<void> {
  const queue = await loadQueue();
  const item = queue.find((q) => q.id === id);
  await saveQueue(queue.filter((q) => q.id !== id));

  for (const uri of [item?.localPhotoUri, item?.localThumbnailUri]) {
    if (uri) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    }
  }
}
