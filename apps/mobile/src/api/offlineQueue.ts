import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TaskStatus } from '@construct/shared';

// Minimal offline queue for task status updates only: if the call fails with
// a network error, we park it here and retry on the next successful moment
// (app start / next task fetch).
//
// TODO(phase-3): replace with the real offline-sync system when photo uploads
// land — that phase needs proper connectivity detection (netinfo), conflict
// handling, and a durable queue shared by all mutation types.

const QUEUE_KEY = 'cc.pendingStatusUpdates';

export interface QueuedStatusUpdate {
  projectId: string;
  taskId: string;
  status: TaskStatus;
  queuedAt: string;
}

async function readQueue(): Promise<QueuedStatusUpdate[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as QueuedStatusUpdate[];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedStatusUpdate[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueStatusUpdate(
  update: Omit<QueuedStatusUpdate, 'queuedAt'>,
): Promise<void> {
  const queue = await readQueue();
  // Last write wins per task — replace any older queued update for it.
  const rest = queue.filter((q) => q.taskId !== update.taskId);
  await writeQueue([...rest, { ...update, queuedAt: new Date().toISOString() }]);
}

/**
 * Tries to send every queued update; keeps the ones that still fail with a
 * network error, drops the rest (sent, or rejected by the server — a 4xx
 * means retrying verbatim will never succeed).
 */
export async function flushStatusQueue(
  send: (update: QueuedStatusUpdate) => Promise<void>,
  isNetworkError: (error: unknown) => boolean,
): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) {
    return;
  }

  const stillPending: QueuedStatusUpdate[] = [];
  for (const update of queue) {
    try {
      await send(update);
    } catch (error) {
      if (isNetworkError(error)) {
        stillPending.push(update);
      }
    }
  }
  await writeQueue(stillPending);
}
