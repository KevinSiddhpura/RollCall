import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const LOCK_KEY = 'rollcall_appLock';
const TIMEOUT_KEY = 'rollcall_lockTimeout';
const PIN_KEY = 'rollcall_appPin';
const PIN_SALT_KEY = 'rollcall_appPinSalt';
const PIN_ATTEMPTS_KEY = 'rollcall_pinAttempts';

function simpleHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

function hashPin(pin: string, salt: string): string {
  let h = salt + pin;
  for (let i = 0; i < 10000; i++) {
    h = simpleHash(h);
  }
  return h;
}

function generateSalt(): string {
  const arr = new Uint32Array(4);
  if (typeof global.crypto !== 'undefined' && global.crypto.getRandomValues) {
    global.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < 4; i++) arr[i] = Math.floor(Math.random() * 0xFFFFFFFF);
  }
  return Array.from(arr).map(n => n.toString(16)).join('');
}

export type LockTimeout = 0 | 1 | 5 | 15;

interface SecurityContextType {
  isLocked: boolean;
  privacyActive: boolean;
  appLockEnabled: boolean;
  lockTimeoutMin: LockTimeout;
  hasPin: boolean;
  lock: () => void;
  unlock: () => void; // Purely UI state transition now
  setAppLock: (enabled: boolean) => Promise<void>;
  setLockTimeout: (min: LockTimeout) => Promise<void>;
  setPin: (pin: string | null) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
}

const SecurityContext = createContext<SecurityContextType | null>(null);

export function SecurityProvider({ children }: { children: ReactNode }) {
  const [isLocked, setIsLocked] = useState(false);
  const [privacyActive, setPrivacyActive] = useState(false);
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [lockTimeoutMin, setLockTimeoutMin] = useState<LockTimeout>(0);
  const [hasPin, setHasPin] = useState(false);
  const lastActiveRef = useRef<number>(Date.now());

  useEffect(() => {
    const init = async () => {
      // Load persisted prefs
      const [lockVal, timeoutVal, pinVal] = await Promise.all([
        SecureStore.getItemAsync(LOCK_KEY),
        SecureStore.getItemAsync(TIMEOUT_KEY),
        SecureStore.getItemAsync(PIN_KEY),
      ]);
      const isLockOn = lockVal === 'true';
      setAppLockEnabled(isLockOn);
      if (isLockOn) setIsLocked(true);
      
      const t = parseInt(timeoutVal ?? '0', 10);
      setLockTimeoutMin(([0, 1, 5, 15].includes(t) ? t : 0) as LockTimeout);
      setHasPin(!!pinVal);
    };
    init();
  }, []);

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        setPrivacyActive(true);
        lastActiveRef.current = Date.now();
      } else if (nextState === 'active') {
        setPrivacyActive(false);
        // Evaluate lock after returning from background
        if (appLockEnabled) {
          const elapsed = (Date.now() - lastActiveRef.current) / 1000 / 60; // minutes
          if (lockTimeoutMin === 0 || elapsed >= lockTimeoutMin) {
            setIsLocked(true);
          }
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [appLockEnabled, lockTimeoutMin]);

  const lock = () => setIsLocked(true);
  const unlock = () => setIsLocked(false);

  const setAppLock = async (enabled: boolean) => {
    await SecureStore.setItemAsync(LOCK_KEY, enabled ? 'true' : 'false');
    setAppLockEnabled(enabled);
    if (!enabled) setIsLocked(false);
  };

  const setLockTimeoutFn = async (min: LockTimeout) => {
    await SecureStore.setItemAsync(TIMEOUT_KEY, String(min));
    setLockTimeoutMin(min);
  };

  const setPin = async (pin: string | null) => {
    if (pin) {
      const salt = generateSalt();
      const hash = hashPin(pin, salt);
      await Promise.all([
        SecureStore.setItemAsync(PIN_KEY, hash),
        SecureStore.setItemAsync(PIN_SALT_KEY, salt),
        SecureStore.deleteItemAsync(PIN_ATTEMPTS_KEY),
      ]);
      setHasPin(true);
    } else {
      await Promise.all([
        SecureStore.deleteItemAsync(PIN_KEY),
        SecureStore.deleteItemAsync(PIN_SALT_KEY),
        SecureStore.deleteItemAsync(PIN_ATTEMPTS_KEY),
      ]);
      setHasPin(false);
    }
  };

  const verifyPin = async (inputPin: string): Promise<boolean> => {
    const attemptsRaw = await SecureStore.getItemAsync(PIN_ATTEMPTS_KEY);
    const attempts = attemptsRaw ? JSON.parse(attemptsRaw) : { count: 0, cooldownUntil: 0 };

    if (Date.now() < attempts.cooldownUntil) {
      return false;
    }

    const [storedHash, salt] = await Promise.all([
      SecureStore.getItemAsync(PIN_KEY),
      SecureStore.getItemAsync(PIN_SALT_KEY),
    ]);

    if (!storedHash || !salt) return false;

    if (hashPin(inputPin, salt) === storedHash) {
      setIsLocked(false);
      lastActiveRef.current = Date.now();
      await SecureStore.deleteItemAsync(PIN_ATTEMPTS_KEY);
      return true;
    }

    // Rate limit: exponential backoff after 3 failed attempts
    const newCount = attempts.count + 1;
    const cooldownUntil = newCount >= 3
      ? Date.now() + Math.min(30000 * Math.pow(2, newCount - 3), 300000)
      : 0;
    await SecureStore.setItemAsync(PIN_ATTEMPTS_KEY, JSON.stringify({ count: newCount, cooldownUntil }));
    return false;
  };

  return (
    <SecurityContext.Provider value={{
      isLocked,
      privacyActive,
      appLockEnabled,
      lockTimeoutMin,
      hasPin,
      lock,
      unlock,
      setAppLock,
      setLockTimeout: setLockTimeoutFn,
      setPin,
      verifyPin,
    }}>
      {children}
    </SecurityContext.Provider>
  );
}

export function useSecurity() {
  const ctx = useContext(SecurityContext);
  if (!ctx) throw new Error('useSecurity must be used within SecurityProvider');
  return ctx;
}
