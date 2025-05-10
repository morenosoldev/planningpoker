import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import axios from "axios";

// Konfigurer axios defaults
axios.defaults.baseURL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
axios.defaults.headers.common["Content-Type"] = "application/json";
axios.defaults.headers.common["Accept"] = "application/json";

interface User {
  id: string;
  email: string;
  username: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  userId: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    username: string
  ) => Promise<void>;
  setAuthToken: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    const session = localStorage.getItem("auth_session");
    if (!session) return;

    try {
      const parsed = JSON.parse(session);
      const isExpired = parsed?.expiry && parsed.expiry < Date.now();

      if (!isExpired && parsed?.token && parsed?.user) {
        setToken(parsed.token);
        setUser(parsed.user);
        setIsAuthenticated(true);
      } else {
        // If expired or invalid, clear it
        localStorage.removeItem("auth_session");
      }
    } catch (e) {
      console.error("Fejl ved parsing af session:", e);
    }
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post("/auth/login", {
        email,
        password,
      });

      const { token, user } = response.data;
      setAuthToken(token, user);
      setIsAuthenticated(true);

      // Sæt isAuthenticated til true når vi har en bruger
      setIsAuthenticated(true);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response.data.message || "Login fejlede");
      }
      throw new Error("Der opstod en fejl under login");
    }
  };

  const register = async (
    email: string,
    password: string,
    username: string
  ) => {
    try {
      const response = await axios.post("/auth/register", {
        email,
        password,
        username,
      });

      const { token, user } = response.data;
      setAuthToken(token, user);
      setIsAuthenticated(true);

      // Sæt isAuthenticated til true når vi har en bruger
      setIsAuthenticated(true);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response.data.message || "Registrering fejlede");
      }
      throw new Error("Der opstod en fejl under registrering");
    }
  };

  // Opdater axios authorization header når token ændres
  React.useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  }, [token]);

  const setAuthToken = (newToken: string, user: User) => {
    const expiry = new Date().getTime() + 24 * 60 * 60 * 1000; // 24 hours
    const session = JSON.stringify({ token: newToken, user, expiry });
    localStorage.setItem("auth_session", session);
    setToken(newToken);
    setUser(user);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem("auth_session");
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
  };

  const value = {
    user,
    token,
    userId: user?.id || null,
    login,
    register,
    setAuthToken,
    logout,
    isAuthenticated,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth skal bruges inden i en AuthProvider");
  }
  return context;
};
