import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ProfileImageUpload from './ProfileImageUpload';
import EmojiPicker from 'emoji-picker-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFloating, offset, shift, flip, arrow } from '@floating-ui/react';

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
  const { roomId } = useParams<{ roomId: string }>();
  const { token, userId } = useAuth();
  const [room, setRoom] = useState<GameRoomData | null>(null);
  const [error, setError] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [newStoryTitle, setNewStoryTitle] = useState('');
  const [newStoryDescription, setNewStoryDescription] = useState('');
  const [isVotingOpen, setIsVotingOpen] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [finalScore, setFinalScore] = useState<number | ''>('');
  const [editableScore, setEditableScore] = useState<number | ''>('');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | undefined>(undefined);
  const [completedStories, setCompletedStories] = useState<CompletedStory[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiReactions, setEmojiReactions] = useState<EmojiReaction[]>([]);
  const arrowRef = useRef(null);
  
  const { x, y, strategy, refs, middlewareData } = useFloating({
    placement: 'top',
    middleware: [
      offset(10),
      flip(),
      shift(),
      arrow({ element: arrowRef })
    ],
  });

  const fetchRoom = useCallback(async () => {
    try {
      console.log('Henter opdateret rumdata...');
      const response = await fetch(`http://localhost:8080/rooms/${roomId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Kunne ikke hente opdateret rumdata');
      }

      const data = await response.json();
      console.log('Opdateret rumdata modtaget:', data);
      
      // Opdater kun hvis der er ændringer i deltagerlisten
      setRoom(prev => {
        if (!prev) return data;
        
        // Sammenlign deltagerlister
        const currentParticipants = new Set(prev.participants.map((p: ParticipantInfo) => p.id));
        const newParticipants = new Set(data.participants.map((p: ParticipantInfo) => p.id));
        
        // Hvis listerne er identiske, behold den eksisterende state
        if (currentParticipants.size === newParticipants.size && 
            [...currentParticipants].every(p => newParticipants.has(p))) {
          console.log('Ingen ændringer i deltagerlisten');
          return prev;
        }
        
        return data;
      });
    } catch (err) {
      console.error('Fejl ved hentning af opdateret rumdata:', err);
    }
  }, [roomId, token]);

  useEffect(() => {
    // Hent rum data
    console.log('=== Auth Status ===');
    console.log('Token fra useAuth:', token);
    console.log('Er token gyldig?', !!token);
    
    if (roomId && token) {
      fetchRoom();
    } else {
      console.error('=== Mangler data for at hente rum ===');
      console.log('roomId:', roomId);
      console.log('token:', token);
    }
  }, [roomId, token, fetchRoom]);

  useEffect(() => {
    // Opret WebSocket forbindelse
    console.log('WebSocket useEffect kører');
    
    const connectWebSocket = () => {
      if (!roomId || !token) {
        console.error('Mangler roomId eller token');
        return;
      }

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('WebSocket forbindelse er allerede åben');
        return;
      }

      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//localhost:8080/rooms/${roomId}/ws?token=${token}`;
        console.log('Forsøger at oprette WebSocket forbindelse til:', wsUrl);
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket forbindelse ÅBNET');
          setIsConnected(true);
          setError('');
        };

        ws.onmessage = (event) => {
          console.log('WebSocket besked modtaget:', event.data);
          try {
            const message = JSON.parse(event.data);
            console.log('Parset besked:', message);
            
            switch (message.message_type) {
              case 'user_connected':
                console.log(`Bruger tilsluttet:`, message.content.user_id);
                setRoom(prev => {
                  if (!prev) return prev;
                  if (prev.participants.some(p => p.id === message.content.user_id)) {
                    console.log('Bruger findes allerede i deltagerlisten');
                    return prev;
                  }
                  return {
                    ...prev,
                    participants: [...prev.participants, {
                      id: message.content.user_id,
                      username: message.content.username || 'Unavailable',
                      profile_image: message.content.profile_image
                    }]
                  };
                });
                break;
                
              case 'user_disconnected':
                console.log(`Bruger forlod:`, message.content.user_id);
                setRoom(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    participants: prev.participants.filter(p => p.id !== message.content.user_id)
                  };
                });
                break;
                
              case 'new_story':
                console.log('Ny historie modtaget:', message.content);
                setRoom(prev => {
                  if (!prev) return prev;
                  const newStory = {
                    id: message.content.id,
                    title: message.content.title,
                    description: message.content.description,
                    votes: []
                  };
                  return {
                    ...prev,
                    current_story: newStory,
                    stories: [...(prev.stories || []), newStory]
                  };
                });
                setIsVotingOpen(false);
                setHasVoted(false);
                setShowResults(false);
                setEditableScore('');
                break;

              case 'start_voting':
                console.log('Afstemning startet');
                setIsVotingOpen(true);
                setHasVoted(false);
                setShowResults(false);
                break;

              case 'vote':
                console.log('Ny stemme modtaget:', message.content);
                handleVote(message);
                break;

              case 'end_voting':
                console.log('Afstemning afsluttet');
                console.log('Current story:', room?.current_story);
                setIsVotingOpen(false);
                setShowResults(true);
                if (room?.admin_id === userId) {
                  const final_score = message.content.final_score;
                  setEditableScore(final_score);
                  console.log('Sætter editable score til:', final_score);
                }
                break;

              case 'save_final_score':
                console.log('Endelig score gemt:', message.content);
                console.log('Current story før nulstilling:', room?.current_story);
                
                // Gem current_story før vi nulstiller det
                const storyToComplete = room?.current_story;
                if (storyToComplete) {
                  console.log('Gemmer historie:', {
                    id: storyToComplete.id,
                    title: storyToComplete.title,
                    final_score: message.content.final_score
                  });
                }
                
                setRoom(prev => {
                  if (!prev?.current_story) {
                    console.log('Ingen aktiv historie at gemme');
                    return prev;
                  }
                  console.log('Nulstiller current_story:', prev.current_story.id);
                  return {
                    ...prev,
                    current_story: undefined,
                    stories: prev.stories.filter(s => s.id !== prev.current_story?.id)
                  };
                });
                setShowResults(false);
                setEditableScore('');
                break;

              case 'completed_story':
                console.log('=== COMPLETED STORY BESKED MODTAGET ===');
                console.log('Rå besked:', message);
                console.log('Besked indhold:', message.content);
                setCompletedStories(prev => {
                  console.log('Nuværende completedStories:', JSON.stringify(prev, null, 2));
                  
                  // Tilføj id feltet hvis det mangler
                  const newStory = {
                    ...message.content,
                    id: message.content.story_id // Brug story_id som id hvis id mangler
                  };
                  
                  console.log('Tilføjer ny historie til completedStories:', JSON.stringify(newStory, null, 2));
                  const updatedStories = [newStory, ...prev];
                  console.log('Opdateret completedStories:', JSON.stringify(updatedStories, null, 2));
                  return updatedStories;
                });
                
                console.log('=== COMPLETED STORY HÅNDTERING AFSLUTTET ===');
                break;
                
              case 'emoji_reaction':
                handleEmojiReaction(message.content);
                break;
                
              default:
                console.log('Ukendt besked type:', message.message_type);
            }
          } catch (err) {
            console.error('Fejl ved parsing af besked:', err);
          }
        };

        ws.onclose = (event) => {
          console.log('WebSocket forbindelse LUKKET');
          setIsConnected(false);
          wsRef.current = null;

          // Forsøg at genoprette forbindelse hvis den ikke blev lukket rent
          if (!event.wasClean) {
            console.log('Forbindelse mistet, forsøger at genoprette...');
            setTimeout(connectWebSocket, 2000);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket FEJL:', error);
          setError('Fejl i WebSocket forbindelsen');
        };
      } catch (error) {
        console.error('Fejl ved oprettelse af WebSocket:', error);
        setError('Kunne ikke oprette WebSocket forbindelse');
      }
    };

    if (roomId && token) {
      console.log('Starter WebSocket forbindelse...');
      connectWebSocket();
    }

    return () => {
      console.log('Oprydning af WebSocket forbindelse');
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [roomId, token]);

  // Tjek om alle har stemt
  const checkAllVoted = useCallback(() => {
    if (!room?.current_story || !isVotingOpen) return false;
    
    // Filtrer inaktive deltagere fra
    const activeParticipants = room.participants.filter(p => p.id);
    const votedParticipants = new Set(room.current_story.votes.map(v => v.user_id));
    
    console.log('Checking votes:', {
      activeParticipants: activeParticipants.map(p => p.id),
      votedParticipants: Array.from(votedParticipants),
      allVoted: activeParticipants.every(p => votedParticipants.has(p.id))
    });
    
    return activeParticipants.every(p => votedParticipants.has(p.id));
  }, [room, isVotingOpen]);

  // Tjek for automatisk afslutning af afstemning
  useEffect(() => {
    if (isVotingOpen && room?.admin_id === userId && checkAllVoted()) {
      console.log('Alle har stemt - afslutter afstemning automatisk');
      endVoting();
    }
  }, [isVotingOpen, checkAllVoted, room?.admin_id, userId]);

  // Start afstemning
  const startVoting = () => {
    if (!wsRef.current || !room?.current_story) return;
    wsRef.current.send(JSON.stringify({
      message_type: 'start_voting',
      content: { story_id: room.current_story.id },
      room_id: roomId,
      user_id: userId
    }));
  };

  // Afslut afstemning
  const endVoting = () => {
    if (!wsRef.current || !room?.current_story) return;
    
    // Beregn den mest populære stemme
    const voteCount: { [key: number]: number } = {};
    room.current_story.votes.forEach(vote => {
      voteCount[vote.value] = (voteCount[vote.value] || 0) + 1;
    });
    
    const mostVotedScore = Object.entries(voteCount)
      .reduce((a, b) => (a[1] > b[1] ? a : b))[0];
    
    setEditableScore(Number(mostVotedScore));
    setShowResults(true);
    
    wsRef.current.send(JSON.stringify({
      message_type: 'end_voting',
      content: { 
        story_id: room.current_story.id,
        final_score: Number(mostVotedScore)
      },
      room_id: roomId,
      user_id: userId
    }));
  };

  // Gem endelig score
  const saveFinalScore = () => {
    if (!wsRef.current || !room?.current_story || editableScore === '') {
      console.log('Kan ikke gemme score:', { 
        hasWsRef: !!wsRef.current, 
        hasCurrentStory: !!room?.current_story, 
        editableScore 
      });
      return;
    }
    
    const final_score = Number(editableScore);
    
    console.log('=== GEMMER ENDELIG SCORE ===');
    console.log('Current Story:', room.current_story);
    console.log('Final Score:', final_score);
    console.log('Room ID:', roomId);
    console.log('User ID:', userId);
    
    const message = {
      message_type: 'save_final_score',
      content: { 
        story: {
          ...room.current_story,
          final_score
        }
      },
      room_id: roomId,
      user_id: userId
    };
    
    console.log('Besked der sendes:', JSON.stringify(message));
    wsRef.current.send(JSON.stringify(message));
  };

  // Stem på en historie
  const submitVote = (value: number) => {
    if (!wsRef.current || !room?.current_story || !isVotingOpen || hasVoted) return;
    
    // Find brugerens info fra deltagerlisten
    const userInfo = room.participants.find((p: ParticipantInfo) => p.id === userId);
    if (!userInfo) return;
    
    wsRef.current.send(JSON.stringify({
      message_type: 'vote',
      content: {
        story_id: room.current_story.id,
        value: value,
        timestamp: Date.now(),
        username: userInfo.username,
        profile_image: userInfo.profile_image
      },
      room_id: roomId,
      user_id: userId
    }));
    
    setHasVoted(true);
  };

  // Håndter indkommende stemmer
  const handleVote = (message: any) => {
    setRoom(prev => {
      if (!prev?.current_story) return prev;
      
      // Tjek om stemmen allerede findes
      const existingVoteIndex = prev.current_story.votes.findIndex(
        v => v.user_id === message.user_id
      );
      
      const newVote = {
        user_id: message.user_id,
        username: message.content.username,
        profile_image: message.content.profile_image,
        value: message.content.value,
        timestamp: message.content.timestamp
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
          votes: updatedVotes
        }
      };
    });
  };

  // Hjælpefunktion til at tjekke om en bruger har stemt
  const hasUserVoted = (userId: string) => {
    return room?.current_story?.votes.some(vote => vote.user_id === userId) ?? false;
  };

  // Hjælpefunktion til at få en brugers stemme
  const getUserVote = (userId: string) => {
    return room?.current_story?.votes.find(vote => vote.user_id === userId)?.value;
  };

  const isAdmin = userId === room?.admin_id;
  console.log('Admin check:', { userId, adminId: room?.admin_id, isAdmin });

  const startNewStory = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Ingen forbindelse til serveren');
      return;
    }

    console.log('Starter oprettelse af ny historie:', { title: newStoryTitle, description: newStoryDescription });
    
    const message = {
      message_type: "new_story",
      content: {
        title: newStoryTitle,
        description: newStoryDescription
      },
      room_id: roomId,
      user_id: userId
    };

    try {
      console.log('Sender new_story besked:', message);
      wsRef.current.send(JSON.stringify(message));
      setNewStoryTitle('');
      setNewStoryDescription('');
      setIsVotingOpen(false);
    } catch (err) {
      console.error('Fejl ved oprettelse af ny historie:', err);
      setError('Kunne ikke oprette ny historie');
    }
  };

  // Hent gemte historier
  const fetchCompletedStories = useCallback(async () => {
    try {
      const response = await fetch(`http://localhost:8080/rooms/${roomId}/completed-stories`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Kunne ikke hente gemte historier');
      }

      const data = await response.json();
      setCompletedStories(data);
    } catch (err) {
      console.error('Fejl ved hentning af gemte historier:', err);
    }
  }, [roomId, token]);

  useEffect(() => {
    if (roomId && token) {
      fetchCompletedStories();
    }
  }, [roomId, token, fetchCompletedStories]);

  const handleProfileImageUpdate = (newImageUrl: string) => {
    // Opdater brugerens profilbillede i deltagerlisten
    setRoom(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        participants: prev.participants.map(p => 
          p.id === userId 
            ? { ...p, profile_image: newImageUrl }
            : p
        )
      };
    });
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
      timestamp: Date.now()
    };
    
    wsRef.current.send(JSON.stringify({
      message_type: 'emoji_reaction',
      content: reaction,
      room_id: roomId,
      user_id: userId
    }));
    
    // Tilføj reaktionen lokalt med det samme for øjeblikkelig feedback
    setEmojiReactions(prev => [...prev, reaction]);
    setShowEmojiPicker(false);
  };

  // Håndter indkommende emoji-reaktioner
  const handleEmojiReaction = (reaction: EmojiReaction) => {
    setEmojiReactions(prev => [...prev, reaction]);
    
    // Fjern reaktionen efter animationen er færdig (3 sekunder)
    setTimeout(() => {
      setEmojiReactions(prev => 
        prev.filter(r => r.timestamp !== reaction.timestamp)
      );
    }, 3000);
  };

  // Render emoji-reaktioner
  const renderEmojiReactions = () => {
    if (!room) return null;

    return emojiReactions.map((reaction, index) => {
      const fromUser = room.participants.find(p => p.id === reaction.fromUserId);
      const toUser = room.participants.find(p => p.id === reaction.toUserId);
      
      if (!fromUser || !toUser) return null;
      
      const fromIndex = room.participants.findIndex(p => p.id === reaction.fromUserId);
      const toIndex = room.participants.findIndex(p => p.id === reaction.toUserId);
      
      if (fromIndex === -1 || toIndex === -1) return null;
      
      const centerX = 400;
      const centerY = 300;
      const radius = 200;
      
      const fromAngle = -90 + (fromIndex * 360) / room.participants.length;
      const toAngle = -90 + (toIndex * 360) / room.participants.length;
      
      const fromX = Math.cos(fromAngle * (Math.PI / 180)) * radius + centerX;
      const fromY = Math.sin(fromAngle * (Math.PI / 180)) * radius + centerY;
      const toX = Math.cos(toAngle * (Math.PI / 180)) * radius + centerX;
      const toY = Math.sin(toAngle * (Math.PI / 180)) * radius + centerY;
      
      // Beregn kontrolpunkt for bue-animation med mere naturlig bue
      const midAngle = (fromAngle + toAngle) / 2;
      const controlDistance = radius * 0.5;
      const controlX = centerX + Math.cos(midAngle * (Math.PI / 180)) * controlDistance;
      const controlY = centerY + Math.sin(midAngle * (Math.PI / 180)) * controlDistance;
      
      return (
        <motion.div
          key={`${reaction.timestamp}-${index}`}
          className="absolute text-3xl pointer-events-none z-50"
          initial={{ 
            scale: 0.5, 
            x: fromX, 
            y: fromY,
            opacity: 0 
          }}
          animate={{
            scale: [0.5, 1.5, 1],
            x: [fromX, controlX, toX],
            y: [fromY, controlY, toY],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: 1.5,
            times: [0, 0.5, 1],
            ease: "easeInOut"
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

  if (!room) {
    return <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar med profilbillede upload */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-2 flex justify-end items-center">
          
          <div className="flex items-center space-x-4">
            <ProfileImageUpload onImageUpdated={handleProfileImageUpdate} />
            <div className="flex items-center space-x-2">
              {room?.participants.find(p => p.id === userId)?.profile_image ? (
                <img 
                  src={`http://localhost:8080${room.participants.find(p => p.id === userId)?.profile_image}`} 
                  alt="Profile" 
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center">
                  <span className="text-sm font-medium text-purple-600">
                    {room?.participants.find(p => p.id === userId)?.username.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <span className="text-gray-700">
                {room?.participants.find(p => p.id === userId)?.username}
              </span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex">
        {/* Hovedindhold */}
        <div className="flex-1 p-4">
          {/* Rum information */}
          <div className="bg-white rounded-lg p-4 shadow mb-4">
            <h2 className="text-xl font-bold">{room?.name}</h2>
            <p className="text-gray-600">Kode: {room?.invite_code}</p>
          </div>

          <div className="flex gap-4">            
            <div className="w-full">
              {room?.current_story ? (
                <div className="bg-white rounded-lg p-4 shadow">
                  <h3 className="text-lg font-semibold mb-4">Aktiv Historie</h3>
                  <div className="mb-4">
                    <h4 className="font-medium">{room.current_story.title}</h4>
                    <p className="text-gray-600">{room.current_story.description}</p>
                  </div>

                  {/* Vis stemmer */}
                  <div className="mb-4">
                    <h4 className="font-medium mb-2">Status:</h4>
                    <p className="text-gray-600">
                      {isVotingOpen 
                        ? `${room.current_story.votes.length} af ${room.participants.length} har stemt`
                        : showResults 
                          ? 'Afstemning afsluttet'
                          : 'Venter på at afstemningen starter'
                      }
                    </p>
                  </div>
                </div>
              ) : room?.admin_id === userId && (
                <div className="bg-white rounded-lg p-4 shadow">
                  <h3 className="text-lg font-semibold mb-4">Opret ny historie</h3>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newStoryTitle}
                      onChange={(e) => setNewStoryTitle(e.target.value)}
                      className="w-full p-2 border rounded"
                      placeholder="Titel..."
                    />
                    <textarea
                      value={newStoryDescription}
                      onChange={(e) => setNewStoryDescription(e.target.value)}
                      className="w-full p-2 border rounded"
                      placeholder="Beskrivelse..."
                    />
                    <button
                      onClick={startNewStory}
                      disabled={!newStoryTitle}
                      className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:text-black"
                    >
                      Opret historie
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-full mt-5">
              <div className="bg-white rounded-lg p-8 shadow">
                <div className="relative w-[800px] h-[600px] mx-auto">
                  {/* Render emoji reactions */}
                  {renderEmojiReactions()}
                  
                  {/* Deltagere i cirkel */}
                  {room?.participants.map((participant, index) => {
                    const angleOffset = -90;
                    const angleStep = 360 / room.participants.length;
                    const angle = angleOffset + (index * angleStep);
                    const radius = 200;
                    const centerX = 400;
                    const centerY = 300;
                    const x = Math.cos(angle * (Math.PI / 180)) * radius + centerX;
                    const y = Math.sin(angle * (Math.PI / 180)) * radius + centerY;
                    
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
                            ref={participant.id === selectedUserId ? refs.setReference : null}
                          >
                            {participant.profile_image ? (
                              <img 
                                src={`http://localhost:8080${participant.profile_image}`} 
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
                                Admin
                              </span>
                            )}
                            {/* Online status indikator */}
                            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
                            
                            {/* Vis stemme hvis afstemning er i gang eller afsluttet */}
                            {room.current_story && (isVotingOpen || showResults) && (
                              <div className="absolute -right-12 top-1/2 transform -translate-y-1/2">
                                <div className={`
                                  w-10 h-10 rounded-full 
                                  ${room.current_story.votes.some(v => v.user_id === participant.id) 
                                    ? 'bg-purple-500 text-white' 
                                    : 'bg-gray-200 text-gray-400'} 
                                  flex items-center justify-center font-bold shadow-md
                                  ${!showResults && room.current_story.votes.some(v => v.user_id === participant.id) ? 'bg-green-500' : ''}
                                `}>
                                  {showResults 
                                    ? room.current_story.votes.find(v => v.user_id === participant.id)?.value || '-'
                                    : room.current_story.votes.some(v => v.user_id === participant.id) ? '✓' : '?'
                                  }
                                </div>
                              </div>
                            )}
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
                  
                  {/* Centrum indhold med forbedret design */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-64 text-center border-2 border-purple-100">
                      <h3 className="font-bold text-xl text-purple-600 mb-3">{room.name}</h3>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-2 py-1 bg-purple-50 rounded-lg">
                          <span className="text-sm text-purple-600">Deltagere</span>
                          <span className="font-bold text-purple-700">{room.participants.length}</span>
                        </div>
                        <div className="flex items-center justify-between px-2 py-1 bg-purple-50 rounded-lg">
                          <span className="text-sm text-purple-600">Historier</span>
                          <span className="font-bold text-purple-700">{completedStories.length}</span>
                        </div>
                        <div className="flex items-center justify-between px-2 py-1 bg-purple-50 rounded-lg">
                          <span className="text-sm text-purple-600">Gennemsnit</span>
                          <span className="font-bold text-purple-700">
                            {completedStories.length > 0 
                              ? (completedStories.reduce((acc, story) => acc + story.final_score, 0) / completedStories.length).toFixed(1)
                              : '-'
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
        </div>

        {/* Sidebar med gemte historier */}
        <div className="w-80 bg-white p-4 border-l border-gray-200 overflow-y-auto h-screen">
          <h3 className="text-lg font-semibold mb-4">Gemte Historier</h3>
          <div className="space-y-4">
            {completedStories.map(story => (
              <div key={story.id} className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium">{story.title}</h4>
                {story.description && (
                  <p className="text-gray-600 text-sm mt-1">{story.description}</p>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    {new Date(story.completed_at * 1000).toLocaleDateString()}
                  </span>
                  <span className="font-bold text-purple-600">
                    Score: {story.final_score}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Kort sektion i bunden */}
      {isVotingOpen && !hasVoted && (
        <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg p-4">
          <div className="max-w-7xl mx-auto">
            <p className="text-center text-lg mb-4">Pick a card below</p>
            <div className="flex justify-center gap-4">
              {[0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, '?'].map((value, index) => (
                <button
                  key={`vote-${value}-${index}`}
                  onClick={() => submitVote(typeof value === 'number' ? value : -1)}
                  className="w-20 h-32 rounded-lg bg-white border-2 border-purple-500 hover:border-purple-600 hover:bg-purple-50 flex items-center justify-center text-2xl font-bold text-purple-500 transition-all transform hover:scale-110"
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameRoom; 