#[derive(Debug, Serialize, Deserialize)]
pub enum MessageType {
    UserConnected,
    UserDisconnected,
    NewStory,
    StartVoting,
    Vote,
    EndVoting,
    SaveFinalScore,
    CompletedStory,
    EmojiReaction,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EmojiReaction {
    emoji: String,
    from_user_id: String,
    to_user_id: String,
    timestamp: i64,
}

async fn handle_ws_message(
    msg: Message,
    room_id: String,
    user_id: String,
    rooms: Arc<Mutex<HashMap<String, Room>>>,
    clients: Arc<Mutex<HashMap<String, Vec<ClientInfo>>>>,
) -> Result<(), Error> {
    match msg {
        Message::Text(text) => {
            let parsed: WebSocketMessage = serde_json::from_str(&text)?;
            
            match parsed.message_type {
                // ... existing message types ...
                
                MessageType::EmojiReaction => {
                    let reaction: EmojiReaction = serde_json::from_value(parsed.content)?;
                    
                    // Broadcast emoji reaction to all clients in the room
                    let room_clients = clients.lock().await.get(&room_id).cloned();
                    if let Some(clients_list) = room_clients {
                        let response = WebSocketMessage {
                            message_type: MessageType::EmojiReaction,
                            content: json!(reaction),
                            room_id: room_id.clone(),
                            user_id: user_id.clone(),
                        };
                        
                        for client in clients_list {
                            if let Some(addr) = client.addr {
                                let _ = addr.do_send(response.clone());
                            }
                        }
                    }
                }
                
                // ... rest of the match arms ...
            }
        }
        _ => {}
    }
    Ok(())
} 