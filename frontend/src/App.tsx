import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import GameRoom from "./components/GameRoom";
import CreateRoom from "./components/CreateRoom";
import JoinRoom from "./components/JoinRoom";
import RoomInvite from "./components/RoomInvite";
import GuestCreateRoom from "./components/GuestCreateRoom";
import GuestJoinByCode from "./components/GuestJoinByCode";
import PrivateRoute from "./components/PrivateRoute";
import AuthenticatedOrGuestRoute from "./components/AuthenticatedOrGuestRoute";

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
                <AuthenticatedOrGuestRoute>
                  <GameRoom />
                </AuthenticatedOrGuestRoute>
              }
            />
            <Route
              path="/join/:roomId"
              element={<RoomInvite />}
            />
            <Route
              path="/rooms/guest/create"
              element={<GuestCreateRoom />}
            />
            <Route
              path="/rooms/guest/join"
              element={<GuestJoinByCode />}
            />
            <Route
              path="/rooms/guest/join"
              element={<GuestJoinByCode />}
            />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
};

export default App;
