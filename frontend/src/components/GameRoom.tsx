import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import ProfileImageUpload from "./ProfileImageUpload";
import LanguageSwitcher from "./LanguageSwitcher";
import EmojiPicker from "emoji-picker-react";
import { motion, AnimatePresence } from "framer-motion";
import { useFloating, offset, shift, flip, arrow } from "@floating-ui/react";
import estimerLogo from "../assets/estimer.png";

interface InviteButtonProps {
  roomId: string | undefined;
  t: (key: string) => string;
}

const InviteButton: React.FC<InviteButtonProps> = ({ roomId, t }) => {
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const inviteLink = `${window.location.origin}/join/${roomId}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-4 py-2 border border-gray-300 text-purple-600 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
          />
        </svg>
        {t("gameRoom.inviteOthers")}
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {t("gameRoom.inviteTitle")}
            </h3>
            <p className="text-gray-600 mb-4 text-sm">
              {t("gameRoom.inviteSubtitle")}
            </p>

            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                value={inviteLink}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded bg-gray-50 text-sm"
              />
              <button
                onClick={copyToClipboard}
                className={`px-4 py-2 rounded transition-colors text-sm font-medium ${
                  copied
                    ? "bg-green-500 text-white"
                    : "border border-gray-300 text-purple-600 hover:bg-gray-50"
                }`}
              >
                {copied ? t("gameRoom.copied") : t("gameRoom.copy")}
              </button>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors text-sm"
              >
                {t("gameRoom.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

interface Story {
  id: string;
  title: string;
  description?: string;
  votes: Vote[];
  final_score?: number;
}

interface Vote {
  user_id: string;
  username: string;
  profile_image?: string;
  value: number;
  timestamp: number;
}

interface GameRoomData {
  id: string;
  name: string;
  invite_code: string;
  admin_id: string;
  participants: ParticipantInfo[];
  current_story?: Story;
  completed_stories: Story[];
  stories: Story[];
  created_at: number;
  updated_at: number;
}

interface ParticipantInfo {
  id: string;
  username: string;
  profile_image?: string;
}

interface CompletedStory {
  id: string;
  story_id: string;
  room_id: string;
  title: string;
  description?: string;
  votes: Vote[];
  final_score: number;
  completed_at: number;
}

interface EmojiReaction {
  emoji: string;
  fromUserId: string;
  toUserId: string;
  timestamp: number;
}

const GameRoom: React.FC = () => {
  const { t } = useTranslation();
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const { token, user, guestUser, getGuestRoomData, logout } = useAuth();
  const userId = user?.id || guestUser?.id || null;
  const [room, setRoom] = useState<GameRoomData | null>(null);
  const [error, setError] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  // Handle initial room data for guest users from navigation state or localStorage
  useEffect(() => {
    if (guestUser && !room) {
      // First try to get room data from navigation state (fresh join)
      if (location.state?.room) {
        setRoom(location.state.room);
      } else {
        // If no navigation state, try to get room data from localStorage (page reload)
        const storedRoomData = getGuestRoomData();
        if (storedRoomData) {
          setRoom(storedRoomData);
        }
      }
    }
  }, [guestUser, location.state, room, getGuestRoomData]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const hasVoted = !!room?.current_story?.votes.some(
    (v) => v.user_id === userId
  );
  const [newStoryTitle, setNewStoryTitle] = useState("");
  const [newStoryDescription, setNewStoryDescription] = useState("");
  const [isVotingOpen, setIsVotingOpen] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [editableScore, setEditableScore] = useState<number | "">("");
  const wsRef = useRef<WebSocket | null>(null);
  const [completedStories, setCompletedStories] = useState<CompletedStory[]>(
    []
  );
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiReactions, setEmojiReactions] = useState<EmojiReaction[]>([]);
  const arrowRef = useRef(null);

  const { x, y, strategy, refs, middlewareData } = useFloating({
    placement: "top",
    middleware: [offset(10), flip(), shift(), arrow({ element: arrowRef })],
  });

  // Sound effects utility functions
  const playSound = useCallback(
    (type: "vote" | "reveal" | "complete") => {
      if (!soundEnabled) return;

      try {
        const audioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Different sounds for different actions
        switch (type) {
          case "vote":
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(
              600,
              audioContext.currentTime + 0.1
            );
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(
              0.01,
              audioContext.currentTime + 0.1
            );
            break;
          case "reveal":
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(
              800,
              audioContext.currentTime + 0.2
            );
            gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(
              0.01,
              audioContext.currentTime + 0.2
            );
            break;
          case "complete":
            // Celebration sound - multiple notes
            oscillator.frequency.setValueAtTime(523, audioContext.currentTime); // C
            oscillator.frequency.setValueAtTime(
              659,
              audioContext.currentTime + 0.1
            ); // E
            oscillator.frequency.setValueAtTime(
              784,
              audioContext.currentTime + 0.2
            ); // G
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(
              0.01,
              audioContext.currentTime + 0.3
            );
            break;
        }

        oscillator.start(audioContext.currentTime);
        oscillator.stop(
          audioContext.currentTime +
            (type === "complete" ? 0.3 : type === "reveal" ? 0.2 : 0.1)
        );
      } catch (error) {
        // Audio not supported or failed
      }
    },
    [soundEnabled]
  );

  const fetchRoom = useCallback(async () => {
    try {
      const response = await fetch(
        `${
          import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"
        }/rooms/${roomId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Kunne ikke hente opdateret rumdata");
      }

      const data = await response.json();

      // Opdater kun hvis der er ændringer i deltagerlisten
      setRoom((prev) => {
        if (!prev) {
          return data;
        }

        // Sammenlign deltagerlister
        const currentParticipants = new Set(
          prev.participants.map((p: ParticipantInfo) => p.id)
        );
        const newParticipants = new Set(
          data.participants.map((p: ParticipantInfo) => p.id)
        );

        // Hvis listerne er identiske, behold den eksisterende state
        if (
          currentParticipants.size === newParticipants.size &&
          [...currentParticipants].every((p) => newParticipants.has(p))
        ) {
          return prev;
        }

        return data;
      });
    } catch (err) {
      // Silent error - room data update failed
    }
  }, [roomId, token]);

  useEffect(() => {
    if (roomId && token && !guestUser && !room) {
      fetchRoom();
    }
  }, [roomId, token, guestUser, room, fetchRoom]);

  useEffect(() => {
    const connectWebSocket = () => {
      if (!roomId || (!token && !guestUser)) {
        return;
      }

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return;
      }

      // Clear any existing error when starting a new connection attempt
      if (connectionAttempts === 0) {
        setError("");
      }
      
      setIsConnecting(true);

      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const apiBaseUrl =
          import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
        // Convert HTTP(S) URL to WebSocket URL
        const wsBaseUrl = apiBaseUrl.replace(/^https?:\/\//, `${protocol}//`);

        // Use different endpoints for regular users vs guests
        let wsUrl;
        if (guestUser) {
          wsUrl = `${wsBaseUrl}/rooms/${roomId}/guest-ws/${guestUser.id}`;
          console.log(`=== CREATING GUEST WEBSOCKET CONNECTION (attempt ${connectionAttempts + 1}) ===`);
        } else {
          wsUrl = `${wsBaseUrl}/rooms/${roomId}/ws?token=${token}`;
          console.log(`=== CREATING REGULAR WEBSOCKET CONNECTION (attempt ${connectionAttempts + 1}) ===`);
        }

        console.log("API Base URL:", apiBaseUrl);
        console.log("WebSocket URL:", wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("WebSocket forbindelse SUCCESS!");
          setIsConnected(true);
          setIsConnecting(false);
          setConnectionAttempts(0);
          setError("");
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            switch (message.message_type) {
              case "user_connected":
                setRoom((prev) => {
                  if (!prev) return prev;

                  // Check if user already exists in participants list
                  const userExists = prev.participants.some(
                    (p) => p.id === message.content.user_id
                  );

                  if (userExists) {
                    // Update existing user's info instead of adding duplicate
                    return {
                      ...prev,
                      participants: prev.participants.map((p) =>
                        p.id === message.content.user_id
                          ? {
                              id: message.content.user_id,
                              username:
                                message.content.username ||
                                p.username ||
                                "Unavailable",
                              profile_image:
                                message.content.profile_image ||
                                p.profile_image,
                            }
                          : p
                      ),
                    };
                  }

                  return {
                    ...prev,
                    participants: [
                      ...prev.participants,
                      {
                        id: message.content.user_id,
                        username: message.content.username || "Unavailable",
                        profile_image: message.content.profile_image,
                      },
                    ],
                  };
                });
                break;

              case "user_disconnected":
                console.log(`Bruger forlod:`, message.content.user_id);
                setRoom((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    participants: prev.participants.filter(
                      (p) => p.id !== message.content.user_id
                    ),
                  };
                });
                break;

              case "existing_user":
                // This message type is just for informing the new user about existing users
                // We don't need to add them to the participants list as they're already there from fetchRoom()
                break;

              case "new_story":
                setRoom((prev) => {
                  if (!prev) return prev;
                  const newStory = {
                    id: message.content.id,
                    title: message.content.title,
                    description: message.content.description,
                    votes: [],
                  };
                  return {
                    ...prev,
                    current_story: newStory,
                    stories: [...(prev.stories || []), newStory],
                  };
                });
                setIsVotingOpen(false);
                setShowResults(false);
                setEditableScore("");
                break;

              case "start_voting":
                setIsVotingOpen(true);
                setShowResults(false);
                break;

              case "vote":
                handleVote(message);
                playSound("vote");
                break;

              case "end_voting":
                console.log("Afstemning afsluttet");
                console.log("Current story:", room?.current_story);
                setIsVotingOpen(false);
                setShowResults(true);
                playSound("reveal");
                if (room?.admin_id === userId) {
                  const final_score = message.content.final_score;
                  setEditableScore(final_score);
                  console.log("Sætter editable score til:", final_score);
                }
                break;

              case "save_final_score":
                console.log("Endelig score gemt:", message.content);
                console.log(
                  "Current story før nulstilling:",
                  room?.current_story
                );

                // Gem current_story før vi nulstiller det
                const storyToComplete = room?.current_story;
                if (storyToComplete) {
                  console.log("Gemmer historie:", {
                    id: storyToComplete.id,
                    title: storyToComplete.title,
                    final_score: message.content.final_score,
                  });
                }

                setRoom((prev) => {
                  if (!prev?.current_story) {
                    console.log("Ingen aktiv historie at gemme");
                    return prev;
                  }
                  console.log(
                    "Nulstiller current_story:",
                    prev.current_story.id
                  );
                  return {
                    ...prev,
                    current_story: undefined,
                    stories: prev.stories.filter(
                      (s) => s.id !== prev.current_story?.id
                    ),
                  };
                });
                setIsVotingOpen(false);
                setShowResults(false);
                setEditableScore("");
                playSound("complete");
                break;

              case "completed_story":
                console.log("=== COMPLETED STORY BESKED MODTAGET ===");
                console.log("Rå besked:", message);
                console.log("Besked indhold:", message.content);
                setCompletedStories((prev) => {
                  console.log(
                    "Nuværende completedStories:",
                    JSON.stringify(prev, null, 2)
                  );

                  // Tilføj id feltet hvis det mangler
                  const newStory = {
                    ...message.content,
                    id: message.content.story_id, // Brug story_id som id hvis id mangler
                  };

                  console.log(
                    "Tilføjer ny historie til completedStories:",
                    JSON.stringify(newStory, null, 2)
                  );
                  const updatedStories = [newStory, ...prev];
                  console.log(
                    "Opdateret completedStories:",
                    JSON.stringify(updatedStories, null, 2)
                  );
                  return updatedStories;
                });

                console.log("=== COMPLETED STORY HÅNDTERING AFSLUTTET ===");
                break;

              case "profile_image_update":
                console.log("Profile image update received:", message.content);
                setRoom((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    participants: prev.participants.map((p) =>
                      p.id === message.content.user_id
                        ? { ...p, profile_image: message.content.profile_image }
                        : p
                    ),
                  };
                });
                break;

              case "emoji_reaction":
                handleEmojiReaction(message.content);
                break;

              default:
                console.log("Ukendt besked type:", message.message_type);
            }
          } catch (err) {
            console.error("Fejl ved parsing af besked:", err);
          }
        };

        ws.onclose = (event) => {
          console.log("WebSocket forbindelse LUKKET", event.code, event.reason);
          setIsConnected(false);
          setIsConnecting(false);
          wsRef.current = null;

          // Implement exponential backoff retry logic
          if (!event.wasClean && connectionAttempts < 5) {
            const delay = Math.min(1000 * Math.pow(2, connectionAttempts), 10000); // Max 10 seconds
            console.log(`Forbindelse mistet, forsøger at genoprette om ${delay}ms (attempt ${connectionAttempts + 1}/5)...`);
            setConnectionAttempts(prev => prev + 1);
            setTimeout(connectWebSocket, delay);
          } else if (connectionAttempts >= 5) {
            setError("Kunne ikke oprette forbindelse til rummet. Prøv at genindlæse siden.");
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket FEJL:", error);
          setIsConnecting(false);
          
          // Don't show error immediately on first attempt - this might be the race condition
          if (connectionAttempts > 0) {
            setError("Fejl i WebSocket forbindelsen");
          }
        };
      } catch (error) {
        console.error("Fejl ved oprettelse af WebSocket:", error);
        setIsConnecting(false);
        setError("Kunne ikke oprette WebSocket forbindelse");
      }
    };

    let timeoutId: NodeJS.Timeout | undefined;
    if (roomId && ((token && !guestUser) || guestUser)) {
      // Add a small delay for room creation to ensure the room is fully initialized on the backend
      const delay = connectionAttempts === 0 ? 500 : 0;
      timeoutId = setTimeout(connectWebSocket, delay);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [roomId, token, guestUser]);

  // Tjek om alle har stemt
  const checkAllVoted = useCallback(() => {
    if (!room?.current_story || !isVotingOpen) return false;

    // Filtrer inaktive deltagere fra
    const activeParticipants = room.participants.filter((p) => p.id);
    const votedParticipants = new Set(
      room.current_story.votes.map((v) => v.user_id)
    );

    console.log("Checking votes:", {
      activeParticipants: activeParticipants.map((p) => p.id),
      votedParticipants: Array.from(votedParticipants),
      allVoted: activeParticipants.every((p) => votedParticipants.has(p.id)),
    });

    return activeParticipants.every((p) => votedParticipants.has(p.id));
  }, [room, isVotingOpen]);

  // Tjek for automatisk afslutning af afstemning
  useEffect(() => {
    if (isVotingOpen && room?.admin_id === userId && checkAllVoted()) {
      console.log("Alle har stemt - afslutter afstemning automatisk");
      endVoting();
    }
  }, [isVotingOpen, checkAllVoted, room?.admin_id, userId]);

  // Start afstemning
  const startVoting = () => {
    if (!wsRef.current || !room?.current_story) return;
    wsRef.current.send(
      JSON.stringify({
        message_type: "start_voting",
        content: { story_id: room.current_story.id },
        room_id: roomId,
        user_id: userId,
      })
    );
  };

  // Afslut afstemning
  const endVoting = () => {
    if (!wsRef.current || !room?.current_story) return;

    // Beregn den mest populære stemme
    const voteCount: { [key: number]: number } = {};
    room.current_story.votes.forEach((vote) => {
      voteCount[vote.value] = (voteCount[vote.value] || 0) + 1;
    });

    const mostVotedScore = Object.entries(voteCount).reduce((a, b) =>
      a[1] > b[1] ? a : b
    )[0];

    setEditableScore(Number(mostVotedScore));
    setShowResults(true);

    wsRef.current.send(
      JSON.stringify({
        message_type: "end_voting",
        content: {
          story_id: room.current_story.id,
          final_score: Number(mostVotedScore),
        },
        room_id: roomId,
        user_id: userId,
      })
    );
  };

  // Gem endelig score
  const saveFinalScore = () => {
    if (!wsRef.current || !room?.current_story || editableScore === "") {
      console.log("Kan ikke gemme score:", {
        hasWsRef: !!wsRef.current,
        hasCurrentStory: !!room?.current_story,
        editableScore,
      });
      return;
    }

    const final_score = Number(editableScore);

    console.log("=== GEMMER ENDELIG SCORE ===");
    console.log("Current Story:", room.current_story);
    console.log("Final Score:", final_score);
    console.log("Room ID:", roomId);
    console.log("User ID:", userId);

    const message = {
      message_type: "save_final_score",
      content: {
        story: {
          ...room.current_story,
          final_score,
        },
      },
      room_id: roomId,
      user_id: userId,
    };

    console.log("Besked der sendes:", JSON.stringify(message));
    wsRef.current.send(JSON.stringify(message));
  };

  // Stem på en historie
  const submitVote = (value: number) => {
    if (!wsRef.current || !room?.current_story || !isVotingOpen || hasVoted)
      return;

    // Find brugerens info fra deltagerlisten
    const userInfo = room.participants.find(
      (p: ParticipantInfo) => p.id === userId
    );
    if (!userInfo) return;

    wsRef.current.send(
      JSON.stringify({
        message_type: "vote",
        content: {
          story_id: room.current_story.id,
          value: value,
          timestamp: Date.now(),
          username: userInfo.username,
          profile_image: userInfo.profile_image,
        },
        room_id: roomId,
        user_id: userId,
      })
    );
  };

  // Håndter indkommende stemmer
  const handleVote = (message: any) => {
    setRoom((prev) => {
      if (!prev?.current_story) return prev;

      // Tjek om stemmen allerede findes
      const existingVoteIndex = prev.current_story.votes.findIndex(
        (v) => v.user_id === message.user_id
      );

      const newVote = {
        user_id: message.user_id,
        username: message.content.username,
        profile_image: message.content.profile_image,
        value: message.content.value,
        timestamp: message.content.timestamp,
      };

      let updatedVotes;
      if (existingVoteIndex >= 0) {
        updatedVotes = [...prev.current_story.votes];
        updatedVotes[existingVoteIndex] = newVote;
      } else {
        updatedVotes = [...prev.current_story.votes, newVote];
      }

      return {
        ...prev,
        current_story: {
          ...prev.current_story,
          votes: updatedVotes,
        },
      };
    });
  };

  const isAdmin = userId === room?.admin_id;

  const startNewStory = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError("Ingen forbindelse til serveren");
      return;
    }

    console.log("Starter oprettelse af ny historie:", {
      title: newStoryTitle,
      description: newStoryDescription,
    });

    const message = {
      message_type: "new_story",
      content: {
        title: newStoryTitle,
        description: newStoryDescription,
      },
      room_id: roomId,
      user_id: userId,
    };

    try {
      console.log("Sender new_story besked:", message);
      wsRef.current.send(JSON.stringify(message));
      setNewStoryTitle("");
      setNewStoryDescription("");
      setIsVotingOpen(false);
    } catch (err) {
      console.error("Fejl ved oprettelse af ny historie:", err);
      setError("Kunne ikke oprette ny historie");
    }
  };

  // Hent gemte historier
  const fetchCompletedStories = useCallback(async () => {
    try {
      const response = await fetch(
        `${
          import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"
        }/rooms/${roomId}/completed-stories`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Kunne ikke hente gemte historier");
      }

      const data = await response.json();
      setCompletedStories(data);
    } catch (err) {
      console.error("Fejl ved hentning af gemte historier:", err);
    }
  }, [roomId, token]);

  useEffect(() => {
    if (roomId && token) {
      fetchCompletedStories();
    }
  }, [roomId, token, fetchCompletedStories]);

  // Helper function to get the correct image source
  const getImageSrc = (
    profileImage: string | undefined
  ): string | undefined => {
    if (!profileImage) return undefined;

    // All images are now server-hosted files, add base URL
    return `${
      import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"
    }${profileImage}`;
  };

  const handleProfileImageUpdate = (newImageUrl: string) => {
    // Opdater brugerens profilbillede i deltagerlisten
    setRoom((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        participants: prev.participants.map((p) =>
          p.id === userId ? { ...p, profile_image: newImageUrl } : p
        ),
      };
    });

    // Send profile image update to all other users via WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const userInfo = room?.participants.find((p) => p.id === userId);
      if (userInfo) {
        wsRef.current.send(
          JSON.stringify({
            message_type: "profile_image_update",
            content: {
              user_id: userId,
              username: userInfo.username,
              profile_image: newImageUrl,
            },
            room_id: roomId,
            user_id: userId,
          })
        );
      }
    }
  };

  // Håndter emoji-klik på en brugers profilbillede
  const handleProfileClick = (participantId: string) => {
    if (participantId === userId) return; // Kan ikke sende emojis til sig selv
    setSelectedUserId(participantId);
    setShowEmojiPicker(true);
  };

  // Send emoji-reaktion
  const sendEmojiReaction = (emoji: string, toUserId: string) => {
    if (!wsRef.current || !userId) return;

    const reaction: EmojiReaction = {
      emoji,
      fromUserId: userId,
      toUserId,
      timestamp: Date.now(),
    };

    wsRef.current.send(
      JSON.stringify({
        message_type: "emoji_reaction",
        content: reaction,
        room_id: roomId,
        user_id: userId,
      })
    );

    // Tilføj reaktionen lokalt med det samme for øjeblikkelig feedback
    setEmojiReactions((prev) => [...prev, reaction]);
    setShowEmojiPicker(false);
  };

  // Håndter indkommende emoji-reaktioner
  const handleEmojiReaction = (reaction: EmojiReaction) => {
    setEmojiReactions((prev) => [...prev, reaction]);

    // Fjern reaktionen efter animationen er færdig (3 sekunder)
    setTimeout(() => {
      setEmojiReactions((prev) =>
        prev.filter((r) => r.timestamp !== reaction.timestamp)
      );
    }, 3000);
  };

  // Render emoji-reaktioner
  const renderEmojiReactions = () => {
    if (!room) return null;

    return emojiReactions.map((reaction, index) => {
      const fromUser = room.participants.find(
        (p) => p.id === reaction.fromUserId
      );
      const toUser = room.participants.find((p) => p.id === reaction.toUserId);

      if (!fromUser || !toUser) return null;

      const fromIndex = room.participants.findIndex(
        (p) => p.id === reaction.fromUserId
      );
      const toIndex = room.participants.findIndex(
        (p) => p.id === reaction.toUserId
      );

      if (fromIndex === -1 || toIndex === -1) return null;

      // Use the same positioning logic as the users
      const totalParticipants = room.participants.length;

      const calculatePosition = (participantIndex: number) => {
        let x, y;

        if (totalParticipants <= 2) {
          // For 1-2 users, place them vertically (top and bottom)
          x = 300; // Center horizontally
          y = participantIndex === 0 ? 100 : 400; // One at top, one at bottom with more space
        } else if (totalParticipants <= 6) {
          // For 3-6 users, use a wider oval
          const angleStep = (2 * Math.PI) / totalParticipants;
          const angle = -Math.PI / 2 + participantIndex * angleStep; // Start from top
          const radiusX = 250; // Wider horizontal radius
          const radiusY = 180; // Increased vertical radius
          x = 300 + Math.cos(angle) * radiusX;
          y = 250 + Math.sin(angle) * radiusY;
        } else {
          // For more users, use a larger oval
          const angleStep = (2 * Math.PI) / totalParticipants;
          const angle = -Math.PI / 2 + participantIndex * angleStep;
          const radiusX = 280;
          const radiusY = 200; // Increased vertical radius
          x = 300 + Math.cos(angle) * radiusX;
          y = 250 + Math.sin(angle) * radiusY;
        }

        return { x, y };
      };

      const fromPos = calculatePosition(fromIndex);
      const toPos = calculatePosition(toIndex);

      // Beregn kontrolpunkt for bue-animation med mere naturlig bue
      const controlX = (fromPos.x + toPos.x) / 2;
      const controlY = Math.min(fromPos.y, toPos.y) - 50; // Arc above the users

      return (
        <motion.div
          key={`${reaction.timestamp}-${index}`}
          className="absolute text-3xl pointer-events-none z-50"
          initial={{
            scale: 0.5,
            x: fromPos.x,
            y: fromPos.y,
            opacity: 0,
          }}
          animate={{
            scale: [0.5, 1.5, 1],
            x: [fromPos.x, controlX, toPos.x],
            y: [fromPos.y, controlY, toPos.y],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: 1.5,
            times: [0, 0.5, 1],
            ease: "easeInOut",
          }}
        >
          {reaction.emoji}
        </motion.div>
      );
    });
  };

  if (error) {
    return <div className="text-red-600 p-4">{error}</div>;
  }

  if (!room || isConnecting) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="bg-white rounded-lg shadow-lg p-8 flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mb-4"></div>
          <p className="text-gray-600 text-lg font-medium">
            {!room ? t('common.loading') : connectionAttempts > 0 ? `${t('common.connecting')} (${connectionAttempts + 1}/5)` : t('common.connecting')}
          </p>
          {connectionAttempts > 2 && (
            <p className="text-gray-500 text-sm mt-2">
              {t('gameRoom.connectionTakingLonger')}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      {/* Top bar med profilbillede upload - Full width */}
      <div className="bg-white shadow-sm w-full">
        <div className="px-4 py-4 flex justify-between items-center">
          {/* Logo on the left */}
          <div className="flex items-center">
            <img
              src={estimerLogo}
              alt="Estimer Logo"
              className="h-12 object-contain"
            />
          </div>

          <div className="flex items-center space-x-4">
            {/* Invite others button */}
            <InviteButton roomId={roomId} t={t} />
            {/* Sound toggle button */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium ${
                soundEnabled ? "text-purple-600" : "text-gray-400"
              }`}
              title={soundEnabled ? "Disable sounds" : "Enable sounds"}
            >
              {soundEnabled ? (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M9 12a3 3 0 003-3V7a3 3 0 00-6 0v2a3 3 0 003 3zm3 0a3 3 0 003-3V7a3 3 0 00-6 0v2a3 3 0 003 3z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                  />
                </svg>
              )}
              {t("gameRoom.sound")}
            </button>
            {/* Language switcher */}
            <LanguageSwitcher />
            <ProfileImageUpload onImageUpdated={handleProfileImageUpdate} />
            <div className="flex items-center space-x-2">
              {room?.participants.find((p) => p.id === userId)
                ?.profile_image ? (
                <img
                  src={getImageSrc(
                    room.participants.find((p) => p.id === userId)
                      ?.profile_image
                  )}
                  alt="Profile"
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center">
                  <span className="text-sm font-medium text-purple-600">
                    {room?.participants
                      .find((p) => p.id === userId)
                      ?.username.charAt(0)
                      .toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-gray-700">
                  {room?.participants.find((p) => p.id === userId)?.username}
                </span>
                {/* Only show logout button for authenticated users, not guests */}
                {user && (
                  <button
                    onClick={logout}
                    className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 transition"
                  >
                    {t("gameRoom.logOut")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-100 text-red-700 rounded-lg mx-4 mt-2">
          {error}
        </div>
      )}

      {/* Main content area - fills remaining height */}
      <div className="flex flex-1">
        {/* Left Sidebar - Voted Users */}
        <div className="w-64 bg-white border-r border-gray-200 p-4 overflow-y-auto relative">
          {/* Room Title */}
          <div className="mb-6 pb-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 truncate">
              {room?.name}
            </h2>
          </div>

          {/* Waiting Section */}
          {((room?.current_story && isVotingOpen) || !room?.current_story) && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-600 flex items-center gap-2">
                <span>⏳</span> {t("gameRoom.waiting")}
                <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full">
                  {!room?.current_story
                    ? room?.participants.length || 0
                    : room.participants.filter(
                        (p) =>
                          !room?.current_story?.votes?.some(
                            (v) => v.user_id === p.id
                          )
                      ).length}
                </span>
              </h3>
              <div className="space-y-3">
                {room?.participants
                  .filter((participant) => {
                    // If no current story, show everyone in waiting
                    if (!room?.current_story) {
                      return true;
                    }
                    // If there is a current story, show only those who haven't voted
                    const hasVoted =
                      room?.current_story?.votes?.some(
                        (v) => v.user_id === participant.id
                      ) || false;
                    return !hasVoted;
                  })
                  .map((participant) => (
                    <motion.div
                      key={participant.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center space-x-3 p-2 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                    >
                      <div className="relative">
                        {participant.profile_image ? (
                          <img
                            src={getImageSrc(participant.profile_image)}
                            alt={participant.username}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center">
                            <span className="text-xs font-bold text-purple-600">
                              {participant.username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        {participant.id === room.admin_id && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {participant.username}
                        </p>
                      </div>
                    </motion.div>
                  ))}
              </div>
            </div>
          )}

          {/* Voted Section */}
          {room?.current_story && (isVotingOpen || showResults) && (
            <div>
              <h3 className="text-lg font-semibold mb-4 text-purple-600 flex items-center gap-2">
                <span>✓</span> {t("gameRoom.voted")}
                <span className="bg-purple-200 text-purple-700 text-xs px-2 py-1 rounded-full">
                  {room.current_story.votes.length}
                </span>
              </h3>
              <div className="space-y-3">
                {room.participants
                  .filter((participant) => {
                    const hasVoted =
                      room?.current_story?.votes?.some(
                        (v) => v.user_id === participant.id
                      ) || false;
                    return hasVoted;
                  })
                  .map((participant) => {
                    const vote = room?.current_story?.votes?.find(
                      (v) => v.user_id === participant.id
                    );

                    return (
                      <motion.div
                        key={participant.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex items-center space-x-3 p-2 rounded-lg bg-purple-50 border border-purple-200 hover:bg-purple-100 transition-colors"
                      >
                        <div className="relative">
                          {participant.profile_image ? (
                            <img
                              src={getImageSrc(participant.profile_image)}
                              alt={participant.username}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center">
                              <span className="text-xs font-bold text-purple-600">
                                {participant.username.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          {participant.id === room.admin_id && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full"></div>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {participant.username}
                          </p>
                        </div>
                        {room?.current_story &&
                          (isVotingOpen || showResults) && (
                            <div className="text-sm">
                              {showResults && vote ? (
                                <span className="font-bold text-purple-600 bg-white px-2 py-1 rounded">
                                  {vote.value === -1 ? "?" : vote.value}
                                </span>
                              ) : (
                                <span className="text-green-600 font-bold">
                                  ✓
                                </span>
                              )}
                            </div>
                          )}
                      </motion.div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Center - Main Content */}
        <div className="flex-1 flex flex-col">
          {/* User Circle - Centered like Kollabe */}
          <div className="flex-1 bg-white flex items-center justify-center p-8">
            <div className="relative w-[600px] h-[500px]">
              {/* Render emoji reactions */}
              {renderEmojiReactions()}

              {/* Users positioned in circle/oval around center */}
              {room?.participants.map((participant, index) => {
                const totalParticipants = room.participants.length;

                // Create an oval/elliptical layout like Kollabe
                let angle, x, y;

                if (totalParticipants <= 2) {
                  // For 1-2 users, place them vertically (top and bottom)
                  x = 300; // Center horizontally
                  y = index === 0 ? 100 : 400; // One at top, one at bottom with more space
                } else if (totalParticipants <= 6) {
                  // For 3-6 users, use a wider oval
                  const angleStep = (2 * Math.PI) / totalParticipants;
                  angle = -Math.PI / 2 + index * angleStep; // Start from top
                  const radiusX = 250; // Wider horizontal radius
                  const radiusY = 180; // Increased vertical radius
                  x = 300 + Math.cos(angle) * radiusX;
                  y = 250 + Math.sin(angle) * radiusY;
                } else {
                  // For more users, use a larger oval
                  const angleStep = (2 * Math.PI) / totalParticipants;
                  angle = -Math.PI / 2 + index * angleStep;
                  const radiusX = 280;
                  const radiusY = 200; // Increased vertical radius
                  x = 300 + Math.cos(angle) * radiusX;
                  y = 250 + Math.sin(angle) * radiusY;
                }

                return (
                  <div
                    key={participant.id}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${x}px`,
                      top: `${y}px`,
                    }}
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <div
                        className="relative cursor-pointer"
                        onClick={() => handleProfileClick(participant.id)}
                        ref={
                          participant.id === selectedUserId
                            ? refs.setReference
                            : null
                        }
                      >
                        {participant.profile_image ? (
                          <img
                            src={getImageSrc(participant.profile_image)}
                            alt={participant.username}
                            className="w-16 h-16 rounded-full object-cover border-4 border-purple-500 shadow-lg hover:scale-110 transition-transform duration-200"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-purple-200 flex items-center justify-center border-4 border-purple-500 shadow-lg hover:scale-110 transition-transform duration-200">
                            <span className="text-xl font-bold text-purple-600">
                              {participant.username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        {participant.id === room.admin_id && (
                          <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs px-2 py-0.5 rounded-full shadow-md">
                            {t("gameRoom.admin")}
                          </span>
                        )}
                        <div
                          className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
                            isConnected
                              ? "bg-green-500 animate-pulse"
                              : "bg-gray-400"
                          }`}
                        />
                      </div>
                      <div className="bg-white px-3 py-1.5 rounded-full shadow-md">
                        <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                          {participant.username}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Center area - "Reveal votes" button or status */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                <div className="bg-white rounded-2xl shadow-xl p-6 min-w-[200px] text-center border-2 border-purple-100">
                  {isVotingOpen && !showResults && (
                    <div className="mb-4">
                      <div className="w-full bg-gray-200 rounded-full h-3 mb-2 shadow-inner">
                        <div
                          className="bg-gradient-to-r from-purple-500 to-purple-600 h-3 rounded-full transition-all duration-500 relative overflow-hidden"
                          style={{
                            width: `${
                              ((room?.current_story?.votes.length || 0) /
                                (room?.participants.length || 1)) *
                              100
                            }%`,
                          }}
                        >
                          <div className="absolute inset-0 bg-white opacity-30 animate-pulse"></div>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mb-3 font-medium">
                        {room?.current_story?.votes.length || 0} of{" "}
                        {room?.participants.length || 0} voted
                        {(room?.current_story?.votes.length || 0) ===
                          (room?.participants.length || 0) && (
                          <span className="ml-2 text-green-600 animate-bounce">
                            ✓ All done!
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                  {isVotingOpen &&
                    !showResults &&
                    room?.admin_id === userId && (
                      <button
                        onClick={endVoting}
                        className="px-4 py-2 border border-gray-300 text-purple-600 rounded-lg hover:bg-gray-50 transition text-sm font-medium animate-pulse"
                      >
                        {t("gameRoom.revealVotes")}
                      </button>
                    )}
                  {showResults && (
                    <div>
                      <h3 className="font-bold text-xl text-purple-600 mb-2">
                        {t("gameRoom.results")}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {t("gameRoom.votingCompleted")}
                      </p>
                    </div>
                  )}
                  {!isVotingOpen && !showResults && (
                    <div>
                      <div>
                        <h3 className="font-bold text-xl text-purple-600">
                          Estimer
                        </h3>
                      </div>
                      <p className="text-sm text-gray-600">
                        {room?.current_story
                          ? "Ready to vote"
                          : t("gameRoom.waitingForStory")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Emoji Picker Popup */}
            <AnimatePresence>
              {showEmojiPicker && selectedUserId && (
                <motion.div
                  ref={refs.setFloating}
                  className="absolute z-50"
                  style={{
                    position: strategy,
                    top: y ?? 0,
                    left: x ?? 0,
                  }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <div
                    ref={arrowRef}
                    className="absolute w-4 h-4 bg-white transform rotate-45"
                    style={{
                      top: middlewareData.arrow?.y,
                      left: middlewareData.arrow?.x,
                    }}
                  />
                  <div className="relative bg-white rounded-lg shadow-xl p-2">
                    <EmojiPicker
                      onEmojiClick={(emojiData) => {
                        if (selectedUserId) {
                          sendEmojiReaction(emojiData.emoji, selectedUserId);
                        }
                      }}
                      width={300}
                      height={400}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Sidebar - Stories */}
        <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
          {/* Current Story */}
          {room?.current_story ? (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-purple-600">
                {t("gameRoom.currentStory")}
              </h3>
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <h4 className="font-medium text-gray-900 mb-2">
                  {room.current_story.title}
                </h4>
                <p className="text-gray-600 text-sm mb-3">
                  {room.current_story.description}
                </p>

                {/* Voting Status */}
                <div className="mb-3">
                  <p className="text-sm text-gray-600">
                    {isVotingOpen
                      ? `${room.current_story.votes.length} af ${room.participants.length} har stemt`
                      : showResults
                      ? "Afstemning afsluttet"
                      : "Venter på at afstemningen starter"}
                  </p>
                </div>

                {/* Admin Controls */}
                {isAdmin &&
                  room.current_story &&
                  !isVotingOpen &&
                  !showResults && (
                    <button
                      onClick={startVoting}
                      className="w-full px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-sm"
                    >
                      {t("gameRoom.startVoting")}
                    </button>
                  )}

                {isAdmin && showResults && (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-700">
                      {t("gameRoom.finalScore")}:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={editableScore}
                        onChange={(e) =>
                          setEditableScore(
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                      />
                      <button
                        onClick={saveFinalScore}
                        className="px-3 py-1 border border-gray-300 text-purple-600 rounded hover:bg-gray-50 transition text-sm"
                      >
                        {t("gameRoom.saveScore")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            room?.admin_id === userId && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 text-purple-600">
                  {t("gameRoom.newStory")}
                </h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={newStoryTitle}
                    onChange={(e) => setNewStoryTitle(e.target.value)}
                    className="w-full p-2 text-sm border rounded focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                    placeholder={t("gameRoom.storyTitle")}
                  />
                  <textarea
                    value={newStoryDescription}
                    onChange={(e) => setNewStoryDescription(e.target.value)}
                    className="w-full p-2 text-sm border rounded h-20 resize-none focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                    placeholder={t("gameRoom.storyDescription")}
                  />
                  <button
                    onClick={startNewStory}
                    disabled={!newStoryTitle}
                    className="w-full px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:text-gray-500 transition text-sm"
                  >
                    {t("gameRoom.createStory")}
                  </button>
                </div>
              </div>
            )
          )}

          {/* Completed Stories */}
          <div className="border-t-2 border-gray-200 pt-4">
            <h3 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
              <span>📚</span> {t("gameRoom.completedStories")}
              <span className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-full">
                {completedStories.length}
              </span>
            </h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {completedStories.map((story) => (
                <div
                  key={story.id}
                  className="p-3 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border-l-4 border-green-400 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm text-gray-900 mb-1">
                        {story.title}
                      </h4>
                      {story.description && (
                        <p className="text-gray-600 text-xs mb-2">
                          {story.description}
                        </p>
                      )}
                      <span className="text-xs text-gray-500">
                        {new Date(
                          story.completed_at * 1000
                        ).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="ml-3 flex flex-col items-center">
                      <span className="font-bold text-green-600 text-lg bg-white px-2 py-1 rounded-full border-2 border-green-200">
                        {story.final_score}
                      </span>
                      <span className="text-xs text-gray-500 mt-1">
                        {t("gameRoom.points")}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Kort sektion i bunden - always visible */}
      <div className="p-4 bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto">
          {!isVotingOpen && !showResults && (
            <p className="text-center text-gray-500 text-sm mb-4">
              Pick a card when voting starts
            </p>
          )}
          <div className="flex justify-center gap-3">
            {[0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, "?"].map((value, index) => {
              const numValue = typeof value === "number" ? value : -1;
              const getCardColor = () => {
                if (!isVotingOpen || hasVoted)
                  return "bg-gray-100 border-gray-300 text-gray-400";
                if (numValue <= 3)
                  return "bg-green-50 border-green-400 text-green-600 hover:border-green-500 hover:bg-green-100";
                if (numValue <= 13)
                  return "bg-yellow-50 border-yellow-400 text-yellow-600 hover:border-yellow-500 hover:bg-yellow-100";
                if (numValue <= 55)
                  return "bg-orange-50 border-orange-400 text-orange-600 hover:border-orange-500 hover:bg-orange-100";
                return "bg-red-50 border-red-400 text-red-600 hover:border-red-500 hover:bg-red-100";
              };

              return (
                <button
                  key={`vote-${value}-${index}`}
                  onClick={() => submitVote(numValue)}
                  disabled={!isVotingOpen || hasVoted}
                  title={
                    numValue === -1
                      ? "Unknown complexity"
                      : numValue <= 3
                      ? "Small story"
                      : numValue <= 13
                      ? "Medium story"
                      : numValue <= 55
                      ? "Large story"
                      : "Very large story"
                  }
                  className={`w-14 h-20 cursor-pointer rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all duration-200 ${
                    !isVotingOpen || hasVoted
                      ? "cursor-not-allowed"
                      : "transform hover:scale-110 hover:-translate-y-1 hover:shadow-lg hover:rotate-1"
                  } ${getCardColor()}`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameRoom;
