import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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
                    <h4 className="font-medium mb-2">Stemmer:</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {room.current_story.votes.map((vote) => (
                        <div key={vote.user_id} className="flex items-center space-x-2 p-2 bg-gray-50 rounded-lg">
                          {vote.profile_image ? (
                            <img src={vote.profile_image} alt={vote.username} className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center">
                              <span className="text-sm font-medium text-purple-600">
                                {vote.username.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{vote.username}</p>
                            <p className="text-purple-600 font-bold">{showResults ? vote.value : '?'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {showResults ? (
                    <div className="space-y-4">
                      <h4 className="font-medium">Afstemning afsluttet</h4>
                      {room.admin_id === userId ? (
                        <div className="space-y-2">
                          <input
                            type="number"
                            value={editableScore}
                            onChange={(e) => setEditableScore(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full p-2 border rounded"
                            placeholder="Juster endelig score..."
                          />
                          <button
                            onClick={saveFinalScore}
                            className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                          >
                            Gem endelig score
                          </button>
                        </div>
                      ) : (
                        <p>Venter på at admin gemmer den endelige score...</p>
                      )}
                    </div>
                  ) : room.admin_id === userId && !isVotingOpen && (
                    <button
                      onClick={startVoting}
                      className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                      Start afstemning
                    </button>
                  )}
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
              <div className="bg-white rounded-lg p-4 shadow">
                <h3 className="text-lg font-semibold mb-4">Deltagere</h3>
                <div className="space-y-2">
                  {room?.participants.map(participant => (
                    <div key={participant.id} className="flex items-center gap-2">
                      {participant.profile_image ? (
                        <img src={participant.profile_image} alt={participant.username} className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center">
                          <span className="text-sm font-medium text-purple-600">
                            {participant.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className="flex-1">{participant.username}</span>
                      {participant.id === room.admin_id && (
                        <span className="text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded">Admin</span>
                      )}
                      <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
                    </div>
                  ))}
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