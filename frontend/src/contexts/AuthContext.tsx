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
  profile_image?: string;
}

interface GuestUser {
  id: string;
  username: string;
  profile_image?: string;
  is_guest: boolean;
}

interface AuthContextType {
  user: User | null;
  guestUser: GuestUser | null;
  token: string | null;
  userId: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    username: string
  ) => Promise<void>;
  joinAsGuest: (
    username: string,
    roomCode: string
  ) => Promise<{ room: any; guest_id: string }>;
  createRoomAsGuest: (
    username: string,
    roomName: string
  ) => Promise<{ room: any; guest_id: string }>;
  setAuthToken: (token: string, user: User) => void;
  setGuestUser: (guestUser: GuestUser) => void;
  getGuestRoomData: () => any | null;
  logout: () => void;
  isAuthenticated: boolean;
  isGuest: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [guestUser, setGuestUser] = useState<GuestUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuest, setIsGuest] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    const session = localStorage.getItem("auth_session");
    const guestSession = localStorage.getItem("guest_session");

    if (session) {
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
    } else if (guestSession) {
      try {
        const parsed = JSON.parse(guestSession);
        const isExpired = parsed?.expiry && parsed.expiry < Date.now();

        if (!isExpired && parsed?.guest) {
          setGuestUser(parsed.guest);
          setIsGuest(true);
        } else {
          localStorage.removeItem("guest_session");
        }
      } catch (e) {
        console.error("Fejl ved parsing af guest session:", e);
      }
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

  const joinAsGuest = async (
    username: string,
    roomCode: string
  ): Promise<{ room: any; guest_id: string }> => {
    try {
      // Create a new axios instance without default Authorization header
      const guestAxios = axios.create({
        baseURL: axios.defaults.baseURL,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      const response = await guestAxios.post("/guest/join", {
        username,
        room_code: roomCode,
      });

      const { room, guest_id } = response.data;

      const guestUserData: GuestUser = {
        id: guest_id,
        username,
        is_guest: true,
      };

      // Store guest session with room information
      const expiry = new Date().getTime() + 24 * 60 * 60 * 1000; // 24 hours
      const session = JSON.stringify({ guest: guestUserData, room, expiry });
      localStorage.setItem("guest_session", session);

      setGuestUser(guestUserData);
      setIsGuest(true);

      return { room, guest_id };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response.data.message || "Guest join fejlede");
      }
      throw new Error("Der opstod en fejl under guest join");
    }
  };

  const createRoomAsGuest = async (
    username: string,
    roomName: string
  ): Promise<{ room: any; guest_id: string }> => {
    try {
      // Create a new axios instance without default Authorization header
      const guestAxios = axios.create({
        baseURL: axios.defaults.baseURL,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      const response = await guestAxios.post("/guest/create", {
        username,
        room_name: roomName,
      });

      const { room, guest_id } = response.data;

      const guestUserData: GuestUser = {
        id: guest_id,
        username,
        is_guest: true,
      };

      // Store guest session with room information
      const expiry = new Date().getTime() + 24 * 60 * 60 * 1000; // 24 hours
      const session = JSON.stringify({ guest: guestUserData, room, expiry });
      localStorage.setItem("guest_session", session);

      setGuestUser(guestUserData);
      setIsGuest(true);

      return { room, guest_id };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(
          error.response.data.message || "Guest room creation fejlede"
        );
      }
      throw new Error("Der opstod en fejl under guest room creation");
    }
  };

  const setGuestUserData = (guest: GuestUser) => {
    setGuestUser(guest);
    setIsGuest(true);
  };

  const getGuestRoomData = () => {
    const guestSession = localStorage.getItem("guest_session");
    if (guestSession) {
      try {
        const parsed = JSON.parse(guestSession);
        const isExpired = parsed?.expiry && parsed.expiry < Date.now();

        if (!isExpired && parsed?.room) {
          return parsed.room;
        }
      } catch (e) {
        console.error("Fejl ved parsing af guest room data:", e);
      }
    }
    return null;
  };

  const logout = () => {
    localStorage.removeItem("auth_session");
    localStorage.removeItem("guest_session");
    setUser(null);
    setGuestUser(null);
    setToken(null);
    setIsAuthenticated(false);
    setIsGuest(false);
  };

  const value = {
    user,
    guestUser,
    token,
    userId: user?.id || guestUser?.id || null,
    login,
    register,
    joinAsGuest,
    createRoomAsGuest,
    setAuthToken,
    setGuestUser: setGuestUserData,
    getGuestRoomData,
    logout,
    isAuthenticated,
    isGuest,
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
