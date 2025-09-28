import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface GuestJoinProps {
  roomCode: string;
}

const GuestJoin: React.FC<GuestJoinProps> = ({ roomCode }) => {
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { joinAsGuest } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("Indtast venligst dit navn");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const { room, guest_id } = await joinAsGuest(username.trim(), roomCode);
      console.log("Guest joined room:", room);

      // Navigate to the room with guest ID and room data
      navigate(`/rooms/${room.id}?guest=${guest_id}`, {
        state: { room, guest_id },
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Der opstod en fejl");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Tilslut som gæst
        </h2>

        <p className="text-gray-600 mb-6 text-center">
          Du er ved at tilslutte dig rummet med kode:{" "}
          <strong>{roomCode}</strong>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700"
            >
              Dit navn
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Indtast dit navn"
              maxLength={50}
              required
            />
          </div>

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <button
            type="submit"
            disabled={isLoading || !username.trim()}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Tilslutter..." : "Tilslut til rum"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Har du allerede en konto?{" "}
            <button
              onClick={() => navigate("/auth")}
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Log ind her
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default GuestJoin;
