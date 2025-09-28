import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface AuthenticatedOrGuestRouteProps {
  children: React.ReactNode;
}

const AuthenticatedOrGuestRoute: React.FC<AuthenticatedOrGuestRouteProps> = ({ children }) => {
  const { isAuthenticated, isGuest } = useAuth();

  // Allow access if user is either authenticated or a guest
  if (!isAuthenticated && !isGuest) {
    return <Navigate to="/auth" />;
  }

  return <>{children}</>;
};

export default AuthenticatedOrGuestRoute;