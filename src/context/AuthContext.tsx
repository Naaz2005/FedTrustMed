import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { api, authToken } from '../services/api';

import type {
  DataAccessScope,
  User,
  UserRole,
} from '../types';

interface RegisterData {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  hospitalId?: string;
  departmentId?: string;
  departmentName?: string;
  requestedPermissions?: DataAccessScope[];
}

interface AuthResult {
  success: boolean;
  message?: string;
  error?: string;
  user?: User;
}

interface RegisterResult {
  success: boolean;
  message?: string;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  role: UserRole;

  login: (
    email: string,
    password: string
  ) => Promise<AuthResult>;

  register: (
    data: RegisterData
  ) => Promise<RegisterResult>;

  logout: () => void;

  hasPermission: (
    permission: DataAccessScope
  ) => boolean;

  refreshUser: () => Promise<void>;

  openLoginModal: boolean;
  setOpenLoginModal: (open: boolean) => void;

  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;

  toggleDarkMode: () => void;
}

const AuthContext = createContext<
  AuthContextType | undefined
>(undefined);

export const AuthProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  const [isAuthenticated, setIsAuthenticated] =
    useState(false);

  const [openLoginModal, setOpenLoginModal] =
    useState(false);

  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem(
      'fedtrustmed_dark_mode'
    );

    if (savedTheme !== null) {
      return savedTheme === 'true';
    }

    return window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;
  });

  /*
   * Restore an existing authenticated session.
   *
   * If there is no JWT token, the application remains
   * logged out and the Landing Page is shown.
   */
  useEffect(() => {
  let cancelled = false;

  const restoreSession = async () => {
    const tokenAtStart = authToken.get();

    if (!tokenAtStart) {
      return;
    }

    try {
      const response = await api.getCurrentUser();

      // Do not allow an older restore request to overwrite
      // a newer login session.
      if (cancelled) {
        return;
      }

      const currentToken = authToken.get();

      if (currentToken !== tokenAtStart) {
        return;
      }

      if (response?.user) {
        setUser(response.user);
        setIsAuthenticated(true);
      } else {
        authToken.clear();
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      if (cancelled) {
        return;
      }

      // Only clear the session if the token that failed
      // is still the current token.
      const currentToken = authToken.get();

      if (currentToken === tokenAtStart) {
        console.error(
          'Failed to restore authentication session:',
          error
        );

        authToken.clear();
        setUser(null);
        setIsAuthenticated(false);
      }
    }
  };

  void restoreSession();

  return () => {
    cancelled = true;
  };
}, []);
  /*
   * Save dark mode preference.
   */
  useEffect(() => {
    localStorage.setItem(
      'fedtrustmed_dark_mode',
      String(darkMode)
    );

    document.documentElement.classList.toggle(
      'dark',
      darkMode
    );
  }, [darkMode]);

  /*
   * LOGIN
   */
  const login = useCallback(
    async (
      email: string,
      password: string
    ): Promise<AuthResult> => {
      try {
        const response = await api.login(
          email,
          password
        );

        if (!response?.success) {
          return {
            success: false,
            message:
              response?.message ||
              'Login failed. Please check your credentials.',
            error:
              response?.message ||
              'Login failed. Please check your credentials.',
          };
        }

        if (!response.user) {
          return {
            success: false,
            message:
              'Login succeeded but user information was not returned.',
            error:
              'Login succeeded but user information was not returned.',
          };
        }

        setUser(response.user);
        setIsAuthenticated(true);
        setOpenLoginModal(false);

        return {
          success: true,
          message: response.message,
          user: response.user,
        };
      } catch (error) {
        console.error('Login error:', error);

        return {
          success: false,
          message:
            'Unable to connect to the server. Please try again.',
          error:
            'Unable to connect to the server. Please try again.',
        };
      }
    },
    []
  );

  /*
   * REGISTRATION
   *
   * Registration creates a pending account.
   * It does NOT automatically authenticate the user.
   */
  const register = useCallback(
    async (
      data: RegisterData
    ): Promise<RegisterResult> => {
      try {
        const response =
          await api.register(data);

        if (!response?.success) {
          return {
            success: false,
            message:
              response?.message ||
              'Registration failed. Please try again.',
            error:
              response?.message ||
              'Registration failed. Please try again.',
          };
        }

        /*
         * IMPORTANT:
         * A newly registered user must remain logged out
         * until the System Administrator approves the account.
         */
        setUser(null);
        setIsAuthenticated(false);

        return {
          success: true,
          message:
            response.message ||
            'Registration request submitted successfully.',
        };
      } catch (error) {
        console.error(
          'Registration error:',
          error
        );

        return {
          success: false,
          message:
            'Unable to connect to the server. Please try again.',
          error:
            'Unable to connect to the server. Please try again.',
        };
      }
    },
    []
  );

  /*
   * LOGOUT
   */
  const logout = useCallback(() => {
    /*
     * Remove JWT from localStorage.
     */
    authToken.clear();

    /*
     * Clear authentication state.
     */
    setUser(null);
    setIsAuthenticated(false);

    /*
     * Close login modal.
     */
    setOpenLoginModal(false);
  }, []);

  /*
   * PERMISSION CHECK
   */
  const hasPermission = useCallback(
    (
      permission: DataAccessScope
    ): boolean => {
      if (!user || !isAuthenticated) {
        return false;
      }

      /*
       * System Administrator has full administrative
       * permissions.
       */
      if (user.role === 'SYSTEM_ADMIN') {
        return true;
      }

      const permissions =
        user.dataAccessPermissions || [];

      return permissions.includes(permission);
    },
    [user, isAuthenticated]
  );

  /*
   * REFRESH CURRENT USER
   */
  const refreshUser = useCallback(async () => {
    if (!isAuthenticated || !user) {
      return;
    }

    try {
      const response =
        await api.getCurrentUser();

      if (response?.user) {
        setUser(response.user);
        return;
      }

      authToken.clear();
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error(
        'Failed to refresh user:',
        error
      );
    }
  }, [isAuthenticated, user]);

  /*
   * DARK MODE
   *
   * Kept as a separate function because Navbar.tsx
   * already uses toggleDarkMode().
   */
  const toggleDarkMode = useCallback(() => {
    setDarkMode((current) => !current);
  }, []);

  /*
   * Role fallback is ONLY for UI rendering.
   *
   * It does not authenticate the user and does not
   * provide any permissions.
   */
  const role: UserRole =
    user?.role ?? 'PATIENT';

  const contextValue =
    useMemo<AuthContextType>(
      () => ({
        user,
        isAuthenticated,
        role,

        login,
        register,
        logout,

        hasPermission,
        refreshUser,

        openLoginModal,
        setOpenLoginModal,

        darkMode,
        setDarkMode,
        toggleDarkMode,
      }),
      [
        user,
        isAuthenticated,
        role,
        login,
        register,
        logout,
        hasPermission,
        refreshUser,
        openLoginModal,
        darkMode,
        toggleDarkMode,
      ]
    );

  return (
    <AuthContext.Provider
      value={contextValue}
    >
      {children}
    </AuthContext.Provider>
  );
};

/*
 * useAuth hook
 */
export const useAuth =
  (): AuthContextType => {
    const context =
      useContext(AuthContext);

    if (!context) {
      throw new Error(
        'useAuth must be used inside an AuthProvider'
      );
    }

    return context;
  };

export default AuthContext;