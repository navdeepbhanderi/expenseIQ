"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  api,
  bootstrapSession,
  setAccessToken,
  setUnauthorizedHandler,
} from "@/lib/api/client";
import type { AuthUser, LoginResponse } from "@/lib/api/types";

interface AuthState {
  user: AuthUser | null;
  /**
   * True until the session has been restored (or found absent) on load.
   *
   * Routes must wait for this rather than treating "no user yet" as logged
   * out - otherwise every reload of an authenticated page flashes the login
   * screen before the refresh cookie has been redeemed.
   */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restores the session from the httpOnly refresh cookie. The access token
  // only ever lived in memory, so a reload always starts here.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const token = await bootstrapSession();

      if (cancelled) return;

      if (token) {
        try {
          const me = await api.get<AuthUser>("/auth/me");
          if (!cancelled) setUser(me);
        } catch {
          // A valid refresh token with a failing /me means something is wrong
          // with the session rather than the network; treat it as logged out.
          if (!cancelled) setAccessToken(null);
        }
      }

      if (!cancelled) setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Lets the API client bounce the user out when the refresh chain fails
  // mid-session, without the client needing to know about the router.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      router.push("/login");
    });

    return () => setUnauthorizedHandler(null);
  }, [router]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<LoginResponse>(
      "/auth/login",
      { email, password },
      { anonymous: true },
    );

    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const signup = useCallback(
    async (email: string, password: string, displayName: string) => {
      // 202, not 200: the account exists but is unverified. The caller sends
      // the user to "check your email" rather than into the app.
      await api.post(
        "/auth/signup",
        { email, password, displayName },
        { anonymous: true },
      );
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      // Local state clears even if the call fails - a user who clicked log out
      // must end up logged out of this browser regardless of the network.
      setAccessToken(null);
      setUser(null);
      router.push("/login");
    }
  }, [router]);

  const value = useMemo(
    () => ({ user, isLoading, login, signup, logout }),
    [user, isLoading, login, signup, logout],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }

  return context;
}
