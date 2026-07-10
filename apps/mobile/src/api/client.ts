import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// Use your machine's LAN IP in apps/mobile/.env (EXPO_PUBLIC_API_URL) when
// testing on a physical device — localhost points at the phone itself.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

let accessToken: string | null = null;
let refreshHandler: (() => Promise<string | null>) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Read by the socket client so reconnects always use the freshest token. */
export function getAccessToken(): string | null {
  return accessToken;
}

/** Registered by the auth store; called once on a 401 to obtain a new token. */
export function setRefreshHandler(fn: () => Promise<string | null>): void {
  refreshHandler = fn;
}

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as RetriableConfig | undefined;

  if (error.response?.status === 401 && original && !original._retried && refreshHandler) {
    original._retried = true;
    const token = await refreshHandler();
    if (token) {
      original.headers.Authorization = `Bearer ${token}`;
      return api.request(original);
    }
  }

  return Promise.reject(error);
});

/** Extracts a human-readable message from an API/axios error. */
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join('\n') : data.message;
    }
    if (!error.response) {
      return `Cannot reach the server at ${API_URL}`;
    }
  }
  return 'Something went wrong. Please try again.';
}
