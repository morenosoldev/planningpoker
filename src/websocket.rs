use actix::{Actor, StreamHandler, Handler, Message, Context, Running, Addr, Recipient};
use actix_web_actors::ws;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use actix::prelude::*;
use mongodb::Database;
use crate::handlers::game_room::{handle_new_story, handle_vote, handle_end_voting, handle_save_final_score};
use crate::models::game_room::{Story, CompletedStory};
use serde_json::json;
use lazy_static::lazy_static;

lazy_static! {
    pub static ref GAME_SERVER: std::sync::Mutex<Option<Addr<GameServer>>> = std::sync::Mutex::new(None);
}

// WebSocket beskeder
#[derive(Message)]
#[rtype(result = "()")]
pub struct Connect {
    pub addr: Recipient<WebSocketMessage>,
    pub room_id: String,
    pub user_id: String,
    pub username: String,
    pub profile_image: Option<String>,
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct Disconnect {
    pub room_id: String,
    pub user_id: String,
}

#[derive(Message, Serialize, Deserialize, Clone)]
#[rtype(result = "()")]
pub struct WebSocketMessage {
    pub message_type: String,
    pub content: serde_json::Value,
    pub room_id: String,
    pub user_id: String,
}

// WebSocket session actor
pub struct WebSocketSession {
    pub room_id: String,
    pub user_id: String,
    pub username: String,
    pub profile_image: Option<String>,
    pub addr: Addr<GameServer>,
    pub db: Database,
}

impl WebSocketSession {
    pub fn new(room_id: String, user_id: String, username: String, profile_image: Option<String>, addr: Addr<GameServer>, db: Database) -> Self {
        Self {
            room_id,
            user_id,
            username,
            profile_image,
            addr,
            db,
        }
    }
}

impl Actor for WebSocketSession {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        println!("WebSocket session startet for bruger {} i rum {}", self.user_id, self.room_id);
        // Tilmeld sessionen til game serveren
        let addr = ctx.address();
        self.addr.do_send(Connect {
            addr: addr.recipient(),
            room_id: self.room_id.clone(),
            user_id: self.user_id.clone(),
            username: self.username.clone(),
            profile_image: self.profile_image.clone(),
        });
    }

    fn stopping(&mut self, _: &mut Self::Context) -> Running {
        println!("WebSocket session stopper for bruger {} i rum {}", self.user_id, self.room_id);
        // Afmeld sessionen fra game serveren
        self.addr.do_send(Disconnect {
            room_id: self.room_id.clone(),
            user_id: self.user_id.clone(),
        });
        Running::Stop
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WebSocketSession {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        println!("WebSocket besked modtaget fra bruger {} i rum {}", self.user_id, self.room_id);
        match msg {
            Ok(ws::Message::Text(text)) => {
                println!("Tekst besked modtaget: {}", text);
                // Håndter indkommende beskeder
                if let Ok(message) = serde_json::from_str::<WebSocketMessage>(&text) {
                    println!("Besked parset succesfuldt");
                    println!("type: {}", message.message_type);
                    // Håndter forskellige besked typer
                    match message.message_type.as_str() {
                        "new_story" => {
                            println!("Forsøger at parse new_story content: {:?}", message.content);
                            match serde_json::from_value::<Story>(message.content.clone()) {
                                Ok(mut story) => {
                                    println!("Ny historie modtaget: {:?}", story);
                                    // Initialiser story felter
                                    story.id = mongodb::bson::oid::ObjectId::new().to_string();
                                    story.votes = Vec::new();
                                    story.final_score = None;
                                    
                                    // Opdater databasen
                                    let db = self.db.clone();
                                    let room_id = self.room_id.clone();
                                    let story_clone = story.clone();
                                    
                                    // Opret en ny besked med den opdaterede historie
                                    let updated_message = WebSocketMessage {
                                        message_type: "new_story".to_string(),
                                        content: serde_json::to_value(story).unwrap_or(message.content.clone()),
                                        room_id: message.room_id.clone(),
                                        user_id: message.user_id.clone(),
                                    };
                                    
                                    actix::spawn(async move {
                                        if let Err(e) = handle_new_story(&db, &room_id, story_clone).await {
                                            println!("Fejl ved opdatering af database: {:?}", e);
                                        }
                                    });
                                    
                                    // Send den opdaterede besked videre til game server
                                    self.addr.do_send(updated_message);
                                    return; // Stop yderligere behandling af beskeden
                                },
                                Err(e) => println!("Fejl ved parsing af story: {:?}", e),
                            }
                        },
                        "vote" => {
                            println!("Forsøger at parse vote content: {:?}", message.content);
                            if let Ok(vote_content) = serde_json::from_value::<serde_json::Value>(message.content.clone()) {
                                if let (Some(story_id), Some(value)) = (
                                    vote_content.get("story_id").and_then(|v| v.as_str()),
                                    vote_content.get("value").and_then(|v| v.as_i64())
                                ) {
                                    let db = self.db.clone();
                                    let room_id = self.room_id.clone();
                                    let user_id = self.user_id.clone();
                                    let story_id = story_id.to_string();
                                    let value = value as i32;
                                    
                                    actix::spawn(async move {
                                        if let Err(e) = handle_vote(&db, &room_id, &user_id, &story_id, value).await {
                                            println!("Fejl ved gemning af vote: {:?}", e);
                                        }
                                    });
                                    
                                    // Send beskeden videre til game server
                                    self.addr.do_send(message);
                                    return;
                                }
                            }
                        },
                        "end_voting" => {
                            println!("Forsøger at parse end_voting content: {:?}", message.content);
                            if let Ok(vote_content) = serde_json::from_value::<serde_json::Value>(message.content.clone()) {
                                if let (Some(story_id), Some(final_score)) = (
                                    vote_content.get("story_id").and_then(|v| v.as_str()),
                                    vote_content.get("final_score").and_then(|v| v.as_i64())
                                ) {
                                    let db = self.db.clone();
                                    let room_id = self.room_id.clone();
                                    let story_id = story_id.to_string();
                                    let final_score = final_score as i32;
                                    
                                    actix::spawn(async move {
                                        if let Err(e) = handle_end_voting(&db, &room_id, &story_id, final_score).await {
                                            println!("Fejl ved afslutning af voting: {:?}", e);
                                        }
                                    });
                                    
                                    // Send beskeden videre til game server
                                    self.addr.do_send(message);
                                    return;
                                }
                            }
                        },
                        "save_final_score" => {
                            println!("Forsøger at parse save_final_score content: {:?}", message.content);
                            if let Ok(content) = serde_json::from_value::<serde_json::Value>(message.content.clone()) {
                                if let Some(story) = content.get("story").cloned() {
                                    let db = self.db.clone();
                                    let room_id = self.room_id.clone();
                                    
                                    println!("Story fra frontend: {:?}", story);
                                    
                                    actix::spawn(async move {
                                        if let Err(e) = handle_save_final_score(&db, &room_id, &story).await {
                                            println!("Fejl ved gemning af endelig score: {:?}", e);
                                        }
                                    });
                                    
                                    // Send beskeden videre til game server
                                    self.addr.do_send(message);
                                    return;
                                }
                            }
                        },
                        _ => println!("Anden type besked: {}", message.message_type),
                    }
                    
                    // Send den originale besked videre til game server for andre beskedtyper
                    self.addr.do_send(message);
                } else {
                    println!("Kunne ikke parse besked som WebSocketMessage");
                }
            }
            Ok(ws::Message::Ping(msg)) => {
                println!("Ping modtaget, sender pong");
                ctx.pong(&msg)
            },
            Ok(ws::Message::Close(reason)) => {
                println!("Close besked modtaget med grund: {:?}", reason);
                ctx.close(reason);
            },
            Ok(_) => println!("Anden type besked modtaget"),
            Err(e) => println!("Fejl ved håndtering af WebSocket besked: {:?}", e),
        }
    }
}

impl Handler<WebSocketMessage> for WebSocketSession {
    type Result = ();

    fn handle(&mut self, msg: WebSocketMessage, ctx: &mut Self::Context) {
        // Send beskeden som tekst til WebSocket klienten
        if let Ok(text) = serde_json::to_string(&msg) {
            ctx.text(text);
        }
    }
}

#[derive(Clone)]
pub struct GameServer {
    sessions: HashMap<String, HashMap<String, Recipient<WebSocketMessage>>>, // room_id -> (user_id -> recipient)
}

impl GameServer {
    pub fn new() -> Self {
        GameServer {
            sessions: HashMap::new(),
        }
    }

    fn get_room_sessions(&self, room_id: &str) -> Option<Vec<Recipient<WebSocketMessage>>> {
        self.sessions.get(room_id).map(|room| room.values().cloned().collect())
    }

    fn send_message(&self, message: &WebSocketMessage, room_id: &str) {
        if let Some(room) = self.sessions.get(room_id) {
            println!("Sender besked til alle deltagere i rum {}", room_id);
            for (user_id, recipient) in room.iter() {
                println!("Sender besked til bruger {}", user_id);
                recipient.do_send(message.clone());
                println!("Besked sendt til bruger {}", user_id);
            }
        } else {
            println!("Ingen deltagere fundet i rum {}", room_id);
        }
    }
}

impl Actor for GameServer {
    type Context = Context<Self>;
}

impl Handler<Connect> for GameServer {
    type Result = ();

    fn handle(&mut self, msg: Connect, _: &mut Context<Self>) {
        println!("Ny forbindelse: Bruger {} tilslutter sig rum {}", msg.user_id, msg.room_id);
        let room = self.sessions.entry(msg.room_id.clone()).or_insert_with(HashMap::new);
        
        println!("Eksisterende deltagere i rum: {:?}", room.keys().collect::<Vec<_>>());
        
        // Send beskeder om eksisterende deltagere til den nye bruger
        for existing_user_id in room.keys() {
            if existing_user_id != &msg.user_id {  // Undgå at sende besked om sig selv
                println!("Sender besked om eksisterende bruger {} til ny bruger {}", existing_user_id, msg.user_id);
                let existing_user_msg = WebSocketMessage {
                    message_type: "user_connected".to_string(),
                    content: serde_json::json!({ "user_id": existing_user_id }),
                    room_id: msg.room_id.clone(),
                    user_id: existing_user_id.clone(),
                };
                println!("Sender besked til ny bruger: {:?}", serde_json::to_string(&existing_user_msg));
                msg.addr.do_send(existing_user_msg);
            }
        }

        // Tilføj den nye bruger til rummet
        room.insert(msg.user_id.clone(), msg.addr.clone());
        println!("Antal deltagere i rum {} efter tilføjelse: {}", msg.room_id, room.len());
        
        // Send besked om ny deltager til alle andre i rummet
        let connect_msg = WebSocketMessage {
            message_type: "user_connected".to_string(),
            content: serde_json::json!({ 
                "user_id": msg.user_id,
                "username": msg.username,
                "profile_image": msg.profile_image
            }),
            room_id: msg.room_id.clone(),
            user_id: msg.user_id,
        };
        println!("Sender user_connected besked til alle andre i rummet");
        self.send_message(&connect_msg, &msg.room_id);
    }
}

impl Handler<Disconnect> for GameServer {
    type Result = ();

    fn handle(&mut self, msg: Disconnect, _: &mut Context<Self>) {
        if let Some(room) = self.sessions.get_mut(&msg.room_id) {
            room.remove(&msg.user_id);
            if room.is_empty() {
                self.sessions.remove(&msg.room_id);
            }
            
            // Send besked om afbrudt forbindelse til alle andre i rummet
            let disconnect_msg = WebSocketMessage {
                message_type: "user_disconnected".to_string(),
                content: serde_json::json!({ "user_id": msg.user_id }),
                room_id: msg.room_id.clone(),
                user_id: msg.user_id,
            };
            println!("Sender user_disconnected besked til alle andre i rummet");
            self.send_message(&disconnect_msg, &msg.room_id);
        }
    }
}

#[derive(Message)]
#[rtype(result = "()")]
pub enum GameMessage {
    NewStory { story: Story },
    StartVoting { story_id: String },
    Vote { user_id: String, story_id: String, value: i32, username: String, profile_image: Option<String> },
    EndVoting { story_id: String, final_score: i32 },
    SaveFinalScore { story_id: String, final_score: i32 },
    CompletedStory { story: CompletedStory },
    UserConnected { user_id: String, username: String, profile_image: Option<String> },
    UserDisconnected { user_id: String },
}

impl Handler<GameMessage> for GameServer {
    type Result = ();

    fn handle(&mut self, msg: GameMessage, _: &mut Context<Self>) {
        let room_sessions = match &msg {
            GameMessage::NewStory { ref story } => self.get_room_sessions(&story.room_id),
            GameMessage::StartVoting { ref story_id } => self.get_room_sessions(story_id),
            GameMessage::Vote { ref story_id, .. } => self.get_room_sessions(story_id),
            GameMessage::EndVoting { ref story_id, .. } => self.get_room_sessions(story_id),
            GameMessage::SaveFinalScore { ref story_id, .. } => self.get_room_sessions(story_id),
            GameMessage::CompletedStory { ref story } => self.get_room_sessions(&story.room_id),
            GameMessage::UserConnected { ref user_id, .. } => self.get_room_sessions(user_id),
            GameMessage::UserDisconnected { ref user_id } => self.get_room_sessions(user_id),
        };

        if let Some(sessions) = room_sessions {
            let message = WebSocketMessage {
                message_type: match &msg {
                    GameMessage::NewStory { .. } => "new_story",
                    GameMessage::StartVoting { .. } => "start_voting",
                    GameMessage::Vote { .. } => "vote",
                    GameMessage::EndVoting { .. } => "end_voting",
                    GameMessage::SaveFinalScore { .. } => "save_final_score",
                    GameMessage::CompletedStory { .. } => "completed_story",
                    GameMessage::UserConnected { .. } => "user_connected",
                    GameMessage::UserDisconnected { .. } => "user_disconnected",
                }.to_string(),
                content: match &msg {
                    GameMessage::NewStory { story } => json!(story),
                    GameMessage::StartVoting { story_id } => json!({ "story_id": story_id }),
                    GameMessage::Vote { user_id, story_id, value, username, profile_image } => json!({
                        "story_id": story_id,
                        "value": value,
                        "username": username,
                        "profile_image": profile_image
                    }),
                    GameMessage::EndVoting { story_id, final_score } => json!({
                        "story_id": story_id,
                        "final_score": final_score
                    }),
                    GameMessage::SaveFinalScore { story_id, final_score } => json!({
                        "story_id": story_id,
                        "final_score": final_score
                    }),
                    GameMessage::CompletedStory { story } => json!(story),
                    GameMessage::UserConnected { user_id, username, profile_image } => json!({
                        "user_id": user_id,
                        "username": username,
                        "profile_image": profile_image
                    }),
                    GameMessage::UserDisconnected { user_id } => json!({ "user_id": user_id }),
                },
                room_id: match &msg {
                    GameMessage::NewStory { story } => story.room_id.clone(),
                    GameMessage::StartVoting { story_id } => story_id.clone(),
                    GameMessage::Vote { story_id, .. } => story_id.clone(),
                    GameMessage::EndVoting { story_id, .. } => story_id.clone(),
                    GameMessage::SaveFinalScore { story_id, .. } => story_id.clone(),
                    GameMessage::CompletedStory { story } => story.room_id.clone(),
                    GameMessage::UserConnected { user_id, .. } => user_id.clone(),
                    GameMessage::UserDisconnected { user_id } => user_id.clone(),
                },
                user_id: "system".to_string(),
            };

            for addr in sessions {
                addr.do_send(message.clone());
            }
        }
    }
}

impl Handler<WebSocketMessage> for GameServer {
    type Result = ();

    fn handle(&mut self, msg: WebSocketMessage, _: &mut Context<Self>) {
        println!("GameServer håndterer WebSocketMessage: {:?}", msg.message_type);
        self.send_message(&msg, &msg.room_id);
    }
} 