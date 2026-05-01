import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { BACKEND_URL } from '../config';
import type { SyncStatus } from '../services/syncService';
import { setDbUserId } from '../services/db/database';
import { clearAllData } from '../services/db/database';

const SESSION_KEY = 'rollcall_session';

type AuthMode = 'loading' | 'unauthenticated' | 'guest' | 'authenticated';

interface AuthUser {
  email: string;
  userId: string;
}

interface AuthContextType {
  mode: AuthMode;
  user: AuthUser | null;
  token: string | null;
  syncStatus: SyncStatus;
  setSyncStatus: (s: SyncStatus) => void;
  continueAsGuest: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  upgradeFromGuest: (email: string, password: string, action: 'signup' | 'signin') => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  deleteAllData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

interface StoredSession {
  email: string;
  userId: string;
  mode: 'authenticated' | 'guest';
  passwordHash?: string;
  token?: string;
}

function simpleHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

async function tryBackendRegister(email: string, password: string): Promise<{ token: string; userId: string } | null> {
  try {
    const res = await axios.post(`${BACKEND_URL}/auth/register`, { email, password }, { timeout: 6000 });
    return { token: res.data.token, userId: String(res.data.userId) };
  } catch (err: any) {
    if (err.response?.status === 409) throw new Error('Email already registered.');
    return null; // network unreachable — allow offline fallback
  }
}

async function tryBackendLogin(email: string, password: string): Promise<{ token: string; userId: string } | null> {
  try {
    const res = await axios.post(`${BACKEND_URL}/auth/login`, { email, password }, { timeout: 6000 });
    return { token: res.data.token, userId: String(res.data.userId) };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AuthMode>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(SESSION_KEY);
        if (raw) {
          const session: StoredSession = JSON.parse(raw);
          if (session.mode === 'authenticated') {
            setUser({ email: session.email, userId: session.userId });
            setToken(session.token ?? null);
            setDbUserId(session.userId);
            setMode('authenticated');
            return;
          }
          if (session.mode === 'guest') {
            setDbUserId('guest');
            setMode('guest');
            return;
          }
        }
      } catch { /* ignore */ }
      setMode('unauthenticated');
    })();
  }, []);

  const continueAsGuest = async () => {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ mode: 'guest' }));
    setDbUserId('guest');
    setMode('guest');
    setUser(null);
    setToken(null);
  };

  const signUp = async (email: string, password: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) throw new Error('Email and password are required.');

    const backendResult = await tryBackendRegister(trimmedEmail, password);
    if (!backendResult) {
      throw new Error('No internet connection. Please connect to the internet to create an account.');
    }

    const session: StoredSession = {
      email: trimmedEmail,
      userId: backendResult.userId,
      mode: 'authenticated',
      passwordHash: simpleHash(password),
      token: backendResult.token,
    };
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    setDbUserId(backendResult.userId);
    setUser({ email: trimmedEmail, userId: backendResult.userId });
    setToken(backendResult.token);
    setSyncStatus('idle');
    setMode('authenticated');
  };

  const signIn = async (email: string, password: string) => {
    const trimmedEmail = email.trim().toLowerCase();

    // Try backend first
    const backendResult = await tryBackendLogin(trimmedEmail, password);
    if (backendResult) {
      const session: StoredSession = {
        email: trimmedEmail,
        userId: backendResult.userId,
        mode: 'authenticated',
        passwordHash: simpleHash(password),
        token: backendResult.token,
      };
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
      setDbUserId(backendResult.userId);
      setUser({ email: trimmedEmail, userId: backendResult.userId });
      setToken(backendResult.token);
      setSyncStatus('idle');
      setMode('authenticated');
      return;
    }

    // Fallback: local credential check (backend unreachable)
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (raw) {
      const session: StoredSession = JSON.parse(raw);
      if (session.email === trimmedEmail && session.passwordHash === simpleHash(password)) {
        setDbUserId(session.userId);
        setUser({ email: session.email, userId: session.userId });
        setToken(null);
        setSyncStatus('offline');
        setMode('authenticated');
        return;
      }
    }
    throw new Error('Invalid email or password.');
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    // Clear local data on sign out to prevent next user/guest from seeing it
    await clearAllData(); 
    setDbUserId('guest');
    setMode('unauthenticated');
    setUser(null);
    setToken(null);
    setSyncStatus('idle');
  };

  const upgradeFromGuest = async (email: string, password: string, action: 'signup' | 'signin') => {
    if (action === 'signup') {
      await signUp(email, password);
    } else {
      await signIn(email, password);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) throw new Error('No session found.');
    const session: StoredSession = JSON.parse(raw);

    if (session.passwordHash !== simpleHash(currentPassword)) {
      throw new Error('Current password is incorrect.');
    }
    if (newPassword.length < 6) throw new Error('New password must be at least 6 characters.');

    // Update server first so local and remote stay in sync
    if (session.token) {
      await axios.patch(
        `${BACKEND_URL}/auth/change-password`,
        { currentPassword, newPassword },
        { headers: { Authorization: `Bearer ${session.token}` }, timeout: 6000 }
      );
    }

    // Only update local hash after server confirms success
    session.passwordHash = simpleHash(newPassword);
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  };

  const deleteAccount = async () => {
    if (!token) throw new Error('No active session.');
    await axios.delete(`${BACKEND_URL}/auth/delete-account`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    await SecureStore.deleteItemAsync(SESSION_KEY);
    setMode('unauthenticated');
    setUser(null);
    setToken(null);
    setSyncStatus('idle');
  };

  const deleteAllData = async () => {
    if (!token) throw new Error('No active session.');
    await axios.delete(`${BACKEND_URL}/sync/all-data`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    // Account stays — no sign out
  };

  return (
    <AuthContext.Provider value={{ mode, user, token, syncStatus, setSyncStatus, continueAsGuest, signUp, signIn, signOut, upgradeFromGuest, changePassword, deleteAccount, deleteAllData }}>
      {children}
    </AuthContext.Provider>
  );
}
