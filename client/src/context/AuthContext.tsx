import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";

interface User {
  id: string;
  email: string;
  role: string;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const abortController = new AbortController();
    checkSession(abortController.signal);
    return () => abortController.abort();
  }, []);

  async function checkSession(signal?: AbortSignal) {
    try {
      const response = await fetch("/api/auth/session", {
        credentials: "include",
        signal
      });
      
      if (response.ok) {
        const data = await response.json();
        if (!signal?.aborted) {
          setUser(data.user);
        }
      } else {
        if (!signal?.aborted) {
          setUser(null);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error("Failed to check session:", error);
      }
      if (!signal?.aborted) {
        setUser(null);
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }

  async function login(email: string, password: string) {
    await apiRequest("POST", "/api/auth/login", { email, password });
    await checkSession();
  }

  async function signup(email: string, password: string) {
    await apiRequest("POST", "/api/auth/signup", { email, password });
    await checkSession();
  }

  async function logout() {
    await apiRequest("POST", "/api/auth/logout");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
