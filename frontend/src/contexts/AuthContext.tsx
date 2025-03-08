import React, { createContext, useContext, useState, ReactNode } from 'react';
import axios from 'axios';

// Konfigurer axios defaults
axios.defaults.baseURL = 'http://localhost:8080';
axios.defaults.headers.common['Content-Type'] = 'application/json';
axios.defaults.headers.common['Accept'] = 'application/json';

interface User {
  id: string;
  email: string;
  username: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  userId: string | null;
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  setAuthToken: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

  const loginWithCredentials = async (email: string, password: string) => {
    try {
      const response = await axios.post('/auth/login', {
        email,
        password,
      });

      const { token, user } = response.data;
      localStorage.setItem('token', token);
      setUser(user);
      setToken(token);
      
      // Sæt isAuthenticated til true når vi har en bruger
      setIsAuthenticated(true);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response.data.message || 'Login fejlede');
      }
      throw new Error('Der opstod en fejl under login');
    }
  };

  const register = async (email: string, password: string, username: string) => {
    try {
      const response = await axios.post('/auth/register', {
        email,
        password,
        username,
      });

      const { token, user } = response.data;
      localStorage.setItem('token', token);
      setUser(user);
      setToken(token);
      
      // Sæt isAuthenticated til true når vi har en bruger
      setIsAuthenticated(true);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response.data.message || 'Registrering fejlede');
      }
      throw new Error('Der opstod en fejl under registrering');
    }
  };

  // Opdater axios authorization header når token ændres
  React.useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  const setAuthToken = (newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
  };

  // Tilføj isAuthenticated state
  const [isAuthenticated, setIsAuthenticated] = useState(!!user);

  const value = {
    user,
    token,
    userId: user?.id || null,
    loginWithCredentials,
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
    throw new Error('useAuth skal bruges inden i en AuthProvider');
  }
  return context;
}; 