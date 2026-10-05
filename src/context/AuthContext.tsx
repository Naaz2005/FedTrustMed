import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { api, authToken } from '../services/api';

import {
  subscribeRealtimeEvents,
} from '../services/realtime';

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

  aadhaarNumber?: string;

  medicalLicenseNumber?: string;

  medicalLicenseDocumentName?: string;
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

  setOpenLoginModal: (
    open: boolean
  ) => void;

  darkMode: boolean;

  setDarkMode: (
    dark: boolean
  ) => void;

  toggleDarkMode: () => void;
}

const AuthContext =
  createContext<
    AuthContextType | undefined
  >(undefined);

export const AuthProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [user, setUser] =
    useState<User | null>(null);

  const [
    isAuthenticated,
    setIsAuthenticated,
  ] = useState(false);

  const [
    openLoginModal,
    setOpenLoginModal,
  ] = useState(false);

  /*
   * ============================================================
   * DARK MODE
   * ============================================================
   */
  const [darkMode, setDarkMode] =
    useState(() => {
      const savedTheme =
        localStorage.getItem(
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
   * ============================================================
   * RESTORE AUTHENTICATED SESSION
   * ============================================================
   *
   * When the application starts:
   *
   * JWT exists
   *      ↓
   * /api/auth/me
   *      ↓
   * PostgreSQL
   *      ↓
   * current user
   *
   * If there is no JWT, the application remains logged out.
   */
  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      const tokenAtStart =
        authToken.get();

      /*
       * No JWT means there is no active session.
       */
      if (!tokenAtStart) {
        return;
      }

      try {
        const response =
          await api.getCurrentUser();

        if (cancelled) {
          return;
        }

        /*
         * Check whether another login/logout
         * happened while this request was running.
         */
        const currentToken =
          authToken.get();

        if (
          currentToken !== tokenAtStart
        ) {
          return;
        }

        if (response?.user) {
          setUser(response.user);

          setIsAuthenticated(true);
        } else {
          /*
           * Token exists but server does not
           * recognize the session.
           */
          authToken.clear();

          setUser(null);

          setIsAuthenticated(false);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        /*
         * Only clear the current session if
         * the failed token is still active.
         */
        const currentToken =
          authToken.get();

        if (
          currentToken === tokenAtStart
        ) {
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
   * ============================================================
   * REAL-TIME AUTHENTICATION SYNC
   * ============================================================
   *
   * This listens for login/logout events from
   * another FedTrustMed browser tab.
   *
   * Example:
   *
   * Tab 1 → logout
   *       ↓
   * BroadcastChannel
   *       ↓
   * Tab 2 → logged out automatically
   */
  useEffect(() => {
    const unsubscribe =
      subscribeRealtimeEvents(
        (event) => {
          /*
           * Another tab logged out.
           */
          if (
            event.type === 'LOGOUT'
          ) {
            setUser(null);

            setIsAuthenticated(false);

            setOpenLoginModal(false);

            return;
          }

          /*
           * Another tab changed authentication.
           *
           * Re-read the JWT and ask the backend
           * for the current authenticated user.
           */
          if (
            event.type === 'AUTH_CHANGED'
          ) {
            const token =
              authToken.get();

            /*
             * No token means logged out.
             */
            if (!token) {
              setUser(null);

              setIsAuthenticated(false);

              return;
            }

            /*
             * Get the latest user from backend.
             */
            void api
              .getCurrentUser()
              .then((response) => {
                if (response?.user) {
                  setUser(
                    response.user
                  );

                  setIsAuthenticated(
                    true
                  );
                } else {
                  setUser(null);

                  setIsAuthenticated(
                    false
                  );
                }
              })
              .catch((error) => {
                console.error(
                  'Failed to synchronize authentication:',
                  error
                );
              });
          }
        }
      );

    return unsubscribe;
  }, []);

  /*
   * ============================================================
   * REAL-TIME USER/DATA SYNC
   * ============================================================
   *
   * If another tab changes:
   *
   * - user approval
   * - permissions
   * - consent
   * - medical records
   * - trust score
   * - threats
   * - federated learning
   *
   * then refresh the current user's information.
   *
   * App.tsx will separately refresh the visible
   * dashboard/module.
   */
  const refreshUser =
    useCallback(async () => {
      /*
       * Don't call the API if there is no
       * authenticated user.
       */
      if (
        !isAuthenticated ||
        !user
      ) {
        return;
      }

      try {
        const response =
          await api.getCurrentUser();

        if (response?.user) {
          setUser(response.user);

          return;
        }

        /*
         * The server no longer considers
         * this session valid.
         */
        authToken.clear();

        setUser(null);

        setIsAuthenticated(false);
      } catch (error) {
        console.error(
          'Failed to refresh user:',
          error
        );
      }
    }, [
      isAuthenticated,
      user,
    ]);

  useEffect(() => {
    const unsubscribe =
      subscribeRealtimeEvents(
        (event) => {
          if (
            event.type !==
            'DATA_CHANGED'
          ) {
            return;
          }

          /*
           * Refresh permissions/status/user
           * information from the backend.
           */
          void refreshUser();
        }
      );

    return unsubscribe;
  }, [refreshUser]);

  /*
   * ============================================================
   * DARK MODE PERSISTENCE
   * ============================================================
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
   * ============================================================
   * LOGIN
   * ============================================================
   */
  const login = useCallback(
    async (
      email: string,
      password: string
    ): Promise<AuthResult> => {
      try {
        const response =
          await api.login(
            email,
            password
          );

        /*
         * Backend must return:
         *
         * {
         *   success: true,
         *   token: "...",
         *   user: {...}
         * }
         */
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

        /*
         * Login succeeded but backend
         * didn't return user information.
         */
        if (!response.user) {
          return {
            success: false,

            message:
              'Login succeeded but user information was not returned.',

            error:
              'Login succeeded but user information was not returned.',
          };
        }

        /*
         * Set authenticated user.
         */
        setUser(response.user);

        setIsAuthenticated(true);

        setOpenLoginModal(false);

        return {
          success: true,

          message:
            response.message,

          user:
            response.user,
        };
      } catch (error) {
        console.error(
          'Login error:',
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
   * ============================================================
   * REGISTRATION
   * ============================================================
   *
   * Registration creates a PENDING account.
   *
   * It does NOT log the user in automatically.
   */
  const register = useCallback(
    async (
      data: RegisterData
    ): Promise<RegisterResult> => {
      try {
        const response =
          await api.register(data);

        /*
         * Registration failed.
         */
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
         *
         * New users remain logged out until
         * System Admin approval.
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
   * ============================================================
   * LOGOUT
   * ============================================================
   */
  const logout = useCallback(() => {
    /*
     * authToken.clear() removes the JWT.
     *
     * Your upgraded api.ts will also broadcast
     * the logout event to other tabs.
     */
    authToken.clear();

    setUser(null);

    setIsAuthenticated(false);

    setOpenLoginModal(false);
  }, []);

  /*
   * ============================================================
   * PERMISSION CHECK
   * ============================================================
   */
  const hasPermission = useCallback(
    (
      permission: DataAccessScope
    ): boolean => {
      /*
       * No user = no permission.
       */
      if (
        !user ||
        !isAuthenticated
      ) {
        return false;
      }

      /*
       * System Admin has full permissions.
       */
      if (
        user.role ===
        'SYSTEM_ADMIN'
      ) {
        return true;
      }

      /*
       * Other roles use permissions
       * granted by System Admin.
       */
      const permissions =
        user.dataAccessPermissions ||
        [];

      return permissions.includes(
        permission
      );
    },
    [
      user,
      isAuthenticated,
    ]
  );

  /*
   * ============================================================
   * TOGGLE DARK MODE
   * ============================================================
   */
  const toggleDarkMode =
    useCallback(() => {
      setDarkMode(
        (current) => !current
      );
    }, []);

  /*
   * ============================================================
   * ROLE
   * ============================================================
   *
   * This fallback is only for rendering.
   *
   * It does NOT grant authentication
   * or permissions.
   */
  const role: UserRole =
    user?.role ?? 'PATIENT';

  /*
   * ============================================================
   * CONTEXT VALUE
   * ============================================================
   */
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
 * ============================================================
 * useAuth HOOK
 * ============================================================
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