import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import GuestJoin from "./GuestJoin";

const RoomInvite: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const { token, isAuthenticated, isGuest } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showGuestOption, setShowGuestOption] = useState(false);
  const [roomInfo, setRoomInfo] = useState<{
    invite_code: string;
    name: string;
  } | null>(null);

  // Debug logging
  console.log("=== RoomInvite Debug ===");
  console.log("roomId:", roomId);
  console.log("token:", !!token);
  console.log("isAuthenticated:", isAuthenticated);
  console.log("isGuest:", isGuest);
  console.log("showGuestOption:", showGuestOption);
  console.log("roomInfo:", roomInfo);
  console.log("error:", error);

  // Fetch room info first
  useEffect(() => {
    if (roomId) {
      fetchRoomInfo(roomId);
    }
  }, [roomId]);

  // Auto-join if user is authenticated
  useEffect(() => {
    console.log("=== Auto-join useEffect ===");
    console.log("Checking conditions...");
    console.log(
      "roomId && token && isAuthenticated && !isGuest:",
      roomId && token && isAuthenticated && !isGuest
    );
    console.log(
      "roomId && !isAuthenticated && roomInfo:",
      roomId && !isAuthenticated && roomInfo
    );
    console.log(
      "roomId && isGuest && roomInfo:",
      roomId && isGuest && roomInfo
    );

    if (roomId && token && isAuthenticated && !isGuest) {
      console.log("Auto-joining room for authenticated user");
      joinRoomById(roomId);
    } else if (roomId && roomInfo && (!isAuthenticated || isGuest)) {
      console.log(
        "Setting up guest option timer (user is not authenticated or is already a guest)"
      );
      // Show guest option for non-authenticated users or existing guests
      const timer = setTimeout(() => {
        console.log("Setting showGuestOption to true");
        setShowGuestOption(true);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      console.log("No action taken - conditions not met");
    }
  }, [roomId, token, isAuthenticated, isGuest, roomInfo]);

  const fetchRoomInfo = async (id: string) => {
    try {
      const response = await fetch(
        `${
          import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"
        }/rooms/${id}/info`
      );

      if (!response.ok) {
        throw new Error("Rum ikke fundet");
      }

      const data = await response.json();
      setRoomInfo(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Kunne ikke hente rum information"
      );
    }
  };

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

  // If showing guest option, render the GuestJoin component
  if (showGuestOption && roomInfo) {
    console.log("=== Rendering GuestJoin component ===");
    return <GuestJoin roomCode={roomInfo.invite_code} />;
  }

  // Loading state for authenticated users
  if (isAuthenticated && roomId) {
    console.log("=== Rendering loading state for authenticated user ===");
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Tilslutter til rum...
          </h2>

          {isLoading && (
            <div className="flex justify-center items-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          )}

          {error && <div className="text-red-600 text-sm mb-4">{error}</div>}

          <p className="text-gray-600">
            Du bliver automatisk tilsluttet rummet...
          </p>
        </div>
      </div>
    );
  }

  // Fallback for invalid room ID or other issues
  console.log("=== Rendering fallback - Ugyldig invitation ===");
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Ugyldig invitation
        </h2>

        <p className="text-gray-600 mb-6">
          Invitationslinkket ser ud til at være ugyldigt eller ikke længere
          aktivt.
        </p>

        <button
          onClick={() => navigate("/")}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Gå til forsiden
        </button>
      </div>
    </div>
  );
};

export default RoomInvite;
