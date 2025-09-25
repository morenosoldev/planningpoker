import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const JoinRoom: React.FC = () => {
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { token } = useAuth();
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  // Auto-join if roomId is provided in URL
  useEffect(() => {
    if (roomId && token) {
      joinRoomById(roomId);
    }
  }, [roomId, token]);

  const joinRoomById = async (id: string) => {
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(
        `${
          import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"
        }/rooms/${id}/join`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Kunne ikke tilslutte til rum");
      }

      const data = await response.json();
      navigate(`/rooms/${data.id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Der skete en fejl ved tilslutning til rummet"
      );
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(
        `${
          import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"
        }/rooms/join`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ invite_code: inviteCode }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Kunne ikke tilslutte til rum");
      }

      const data = await response.json();
      navigate(`/rooms/${data.id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Der skete en fejl ved tilslutning til rummet"
      );
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // If roomId is provided, show joining status
  if (roomId) {
    return (
      <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6">Tilslutter til rum...</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-gray-600">Tilslutter...</span>
          </div>
        ) : error ? (
          <div className="text-center">
            <button
              onClick={() => navigate("/dashboard")}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
            >
              Tilbage til Dashboard
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6">Tilslut til rum</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label
            htmlFor="inviteCode"
            className="block text-gray-700 font-medium mb-2"
          >
            Invitationskode
          </label>
          <input
            type="text"
            id="inviteCode"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            placeholder="F.eks. ABC123"
            required
            disabled={isLoading}
            maxLength={6}
            pattern="[A-Z0-9]{6}"
            title="Invitationskoden skal være 6 tegn lang og må kun indeholde store bogstaver og tal"
          />
        </div>

        <button
          type="submit"
          className={`w-full py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${
            isLoading ? "opacity-50 cursor-not-allowed" : ""
          }`}
          disabled={isLoading}
        >
          {isLoading ? "Tilslutter..." : "Tilslut til rum"}
        </button>
      </form>
    </div>
  );
};

export default JoinRoom;
