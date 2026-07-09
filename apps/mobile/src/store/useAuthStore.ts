import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import type { AuthResponseDto, UserDto } from '@construct/shared';
import { api, API_URL, setAccessToken, setRefreshHandler } from '../api/client';

// Tokens live in expo-secure-store (encrypted at rest), never AsyncStorage.
const ACCESS_TOKEN_KEY = 'cc.accessToken';
const REFRESH_TOKEN_KEY = 'cc.refreshToken';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: UserDto | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Restores the session from secure storage on app start. */
  hydrate: () => Promise<void>;
}

async function persistSession(auth: AuthResponseDto): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, auth.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, auth.refreshToken),
  ]);
  setAccessToken(auth.accessToken);
}

async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
  setAccessToken(null);
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',

  async login(email, password) {
    const { data } = await api.post<AuthResponseDto>('/auth/login', { email, password });
    await persistSession(data);
    set({ user: data.user, status: 'authenticated' });
  },

  async register(name, email, password) {
    const { data } = await api.post<AuthResponseDto>('/auth/register', {
      name,
      email,
      password,
    });
    await persistSession(data);
    set({ user: data.user, status: 'authenticated' });
  },

  async logout() {
    await clearSession();
    set({ user: null, status: 'unauthenticated' });
  },

  async hydrate() {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    ]);

    if (!accessToken && !refreshToken) {
      set({ status: 'unauthenticated' });
      return;
    }

    setAccessToken(accessToken);
    try {
      // A 401 here triggers the refresh interceptor automatically.
      const { data } = await api.get<UserDto>('/auth/me');
      set({ user: data, status: 'authenticated' });
    } catch {
      await clearSession();
      set({ user: null, status: 'unauthenticated' });
    }
  },
}));

// On 401, trade the stored refresh token for a new pair; log out if that fails.
setRefreshHandler(async () => {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    return null;
  }
  try {
    // Raw axios: the shared instance's interceptor must not recurse.
    const { data } = await axios.post<AuthResponseDto>(`${API_URL}/auth/refresh`, {
      refreshToken,
    });
    await persistSession(data);
    return data.accessToken;
  } catch {
    await useAuthStore.getState().logout();
    return null;
  }
});
