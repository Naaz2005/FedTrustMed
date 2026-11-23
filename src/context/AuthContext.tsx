import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, User, SimulationIdentity, getStoredToken, setStoredToken, AuthResponse } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  simulationMode: boolean;
  simulationIdentities: SimulationIdentity[];
  isLoginModalOpen: boolean;
  loginModalTab: 'login' | 'register';
  openLoginModal: (tab?: 'login' | 'register') => void;
  closeLoginModal: () => void;
  login: (credentials: { email: string; password: string; otp?: string }) => Promise<AuthResponse>;
  register: (formData: FormData) => Promise<AuthResponse>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  reloadSimulationInfo: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [simulationMode, setSimulationMode] = useState<boolean>(false);
  const [simulationIdentities, setSimulationIdentities] = useState<SimulationIdentity[]>([]);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [loginModalTab, setLoginModalTab] = useState<'login' | 'register'>('login');

  const openLoginModal = useCallback((tab: 'login' | 'register' = 'login') => {
    setLoginModalTab(tab);
    setIsLoginModalOpen(true);
  }, []);

  const closeLoginModal = useCallback(() => {
    setIsLoginModalOpen(false);
  }, []);

  const loadSimulationInfo = useCallback(async () => {
    try {
      const data = await api.getSimulationInfo();
      setSimulationMode(Boolean(data.simulationMode));
      setSimulationIdentities(data.identities || []);
    } catch (err) {
      console.warn('Failed to fetch simulation info:', err);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const currentToken = getStoredToken();
    if (!currentToken) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await api.getCurrentUser();
      if (res.success && res.user) {
        setUser(res.user);
      } else {
        setUser(null);
        setStoredToken(null);
        setToken(null);
      }
    } catch (err) {
      console.warn('Failed to authenticate session:', err);
      setUser(null);
      setStoredToken(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    loadSimulationInfo();
  }, [refreshUser, loadSimulationInfo]);

  const login = useCallback(
    async (credentials: { email: string; password: string; otp?: string }): Promise<AuthResponse> => {
      const res = await api.login(credentials);
      if (res.token && res.user) {
        setStoredToken(res.token);
        setToken(res.token);
        setUser(res.user);
      }
      return res;
    },
    []
  );

  const register = useCallback(async (formData: FormData): Promise<AuthResponse> => {
    return await api.register(formData);
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(user && token),
        isLoading,
        simulationMode,
        simulationIdentities,
        isLoginModalOpen,
        loginModalTab,
        openLoginModal,
        closeLoginModal,
        login,
        register,
        logout,
        refreshUser,
        reloadSimulationInfo: loadSimulationInfo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
