import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import GameRoom from "./components/GameRoom";
import CreateRoom from "./components/CreateRoom";
import JoinRoom from "./components/JoinRoom";
import PrivateRoute from "./components/PrivateRoute";

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen min-w-screen flex flex-col">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/rooms/create"
              element={
                <PrivateRoute>
                  <CreateRoom />
                </PrivateRoute>
              }
            />
            <Route
              path="/rooms/join"
              element={
                <PrivateRoute>
                  <JoinRoom />
                </PrivateRoute>
              }
            />
            <Route
              path="/rooms/:roomId"
              element={
                <PrivateRoute>
                  <GameRoom />
                </PrivateRoute>
              }
            />
            <Route
              path="/join/:roomId"
              element={
                <PrivateRoute>
                  <JoinRoom />
                </PrivateRoute>
              }
            />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
};

export default App;
