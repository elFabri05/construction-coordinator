import { AppState, AppStateStatus } from 'react-native';
import { io, Socket } from 'socket.io-client';
import type { AiSuggestionDto, SubmissionDto, TaskDto } from '@construct/shared';
import { WS_EVENTS } from '@construct/shared';
import { API_URL, getAccessToken } from '../api/client';
import { useSubmissionsStore } from '../store/useSubmissionsStore';
import { useSuggestionsStore } from '../store/useSuggestionsStore';
import { useTasksStore } from '../store/useTasksStore';

// Don't hold a socket open indefinitely in the background (battery/data);
// give quick app switches a grace period before dropping it.
const BACKGROUND_DISCONNECT_MS = 30_000;

let socket: Socket | null = null;
let backgroundTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Connects (or reconnects) the realtime socket using the current JWT.
 * Server-side room membership is re-derived on every connect, so reconnects
 * need no client-side state. Incoming events are pushed straight into the
 * zustand stores — screens re-render automatically.
 */
export function connectSocket(): void {
  if (socket?.connected || !getAccessToken()) {
    return;
  }
  disconnectSocket();

  socket = io(API_URL, {
    transports: ['websocket'],
    // Function form: every (re)connection attempt reads the freshest token,
    // so a token refresh doesn't strand the socket with stale auth.
    auth: (cb) => cb({ token: getAccessToken() }),
  });

  socket.on(WS_EVENTS.submissionCreated, (submission: SubmissionDto) => {
    useSubmissionsStore.getState().applyRealtimeSubmission(submission);
  });
  socket.on(WS_EVENTS.suggestionCreated, (suggestion: AiSuggestionDto) => {
    useSuggestionsStore.getState().applyRealtimeSuggestion(suggestion);
  });
  socket.on(WS_EVENTS.taskUpdated, (task: TaskDto) => {
    useTasksStore.getState().applyRealtimeTask(task);
  });
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket?.removeAllListeners();
  socket = null;
}

/**
 * Background: disconnect after a grace period. Foreground: reconnect
 * (socket.io also auto-reconnects after transient network drops while the
 * app is active).
 */
function handleAppStateChange(state: AppStateStatus): void {
  if (state === 'active') {
    if (backgroundTimer) {
      clearTimeout(backgroundTimer);
      backgroundTimer = null;
    }
    connectSocket();
  } else if (state === 'background') {
    backgroundTimer ??= setTimeout(() => {
      backgroundTimer = null;
      disconnectSocket();
    }, BACKGROUND_DISCONNECT_MS);
  }
}

AppState.addEventListener('change', handleAppStateChange);
