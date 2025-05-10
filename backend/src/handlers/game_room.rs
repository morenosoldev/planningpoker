use actix_web::{
    post,
    get,
    web,
    HttpResponse,
    Result,
    error::ErrorInternalServerError,
    HttpRequest,
    error::ErrorUnauthorized,
};
use actix_web_actors::ws;
use mongodb::Database;
use crate::models::game_room::{ GameRoom, CreateRoomDto, JoinRoomDto, Story, Vote, CompletedStory };
use crate::models::user::User;
use crate::middleware::auth::validate_token;
use crate::websocket::{ WebSocketSession, GameServer, GameMessage, GAME_SERVER };
use jsonwebtoken::{ decode, Validation, Algorithm, DecodingKey };
use crate::middleware::auth::Claims;
use rand::Rng;
use std::time::{ SystemTime, UNIX_EPOCH };
use mongodb::bson::doc;
use serde::Serialize;
use futures_util::stream::TryStreamExt;

fn generate_invite_code() -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const CODE_LENGTH: usize = 6;

    let mut rng = rand::thread_rng();
    (0..CODE_LENGTH)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

#[derive(Debug, Serialize)]
pub struct ParticipantInfo {
    pub id: String,
    pub username: String,
    pub profile_image: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct GameRoomResponse {
    pub id: String,
    pub name: String,
    pub invite_code: String,
    pub admin_id: String,
    pub participants: Vec<ParticipantInfo>,
    pub current_story: Option<Story>,
    pub completed_stories: Vec<Story>,
    pub stories: Vec<Story>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[post("/rooms")]
pub async fn create_room(
    req: HttpRequest,
    db: web::Data<Database>,
    room_data: web::Json<CreateRoomDto>
) -> Result<HttpResponse> {
    let user_id = validate_token(req.clone()).await?;

    let collection = db.collection::<GameRoom>("game_rooms");

    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;

    let new_room = GameRoom {
        id: None,
        name: room_data.name.clone(),
        invite_code: generate_invite_code(),
        admin_id: user_id.clone(),
        participants: vec![user_id],
        current_story: None,
        completed_stories: Vec::new(),
        stories: Vec::new(),
        created_at: now,
        updated_at: now,
    };

    let insert_result = collection
        .insert_one(&new_room, None).await
        .map_err(ErrorInternalServerError)?;

    let room_response = GameRoomResponse {
        id: insert_result.inserted_id.as_object_id().unwrap().to_string(),
        name: new_room.name,
        invite_code: new_room.invite_code,
        admin_id: new_room.admin_id,
        participants: new_room.participants
            .iter()
            .map(|id| ParticipantInfo {
                id: id.to_string(),
                username: "".to_string(),
                profile_image: None,
            })
            .collect(),
        current_story: new_room.current_story,
        completed_stories: new_room.completed_stories,
        stories: new_room.stories,
        created_at: new_room.created_at,
        updated_at: new_room.updated_at,
    };

    Ok(HttpResponse::Created().json(room_response))
}

#[post("/rooms/join")]
pub async fn join_room(
    req: HttpRequest,
    db: web::Data<Database>,
    join_data: web::Json<JoinRoomDto>
) -> Result<HttpResponse> {
    let user_id = validate_token(req.clone()).await?;

    let collection = db.collection::<GameRoom>("game_rooms");

    let room = match
        collection
            .find_one(mongodb::bson::doc! { "invite_code": &join_data.invite_code }, None).await
            .map_err(ErrorInternalServerError)?
    {
        Some(room) => room,
        None => {
            return Ok(
                HttpResponse::NotFound().json(
                    serde_json::json!({
                "message": "Spilrum ikke fundet"
            })
                )
            );
        }
    };

    // Check if user is already in the room
    if room.participants.contains(&user_id) {
        return Ok(
            HttpResponse::BadRequest().json(
                serde_json::json!({
            "message": "Du er allerede i dette spilrum"
        })
            )
        );
    }

    // Add user to participants
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;

    let update_result = collection
        .update_one(
            mongodb::bson::doc! { "invite_code": &join_data.invite_code },
            mongodb::bson::doc! {
                "$push": { "participants": &user_id },
                "$set": { "updated_at": now }
            },
            None
        ).await
        .map_err(ErrorInternalServerError)?;

    if update_result.modified_count == 0 {
        return Ok(
            HttpResponse::InternalServerError().json(
                serde_json::json!({
            "message": "Kunne ikke tilføje dig til spilrummet"
        })
            )
        );
    }

    let room_response = GameRoomResponse {
        id: room.id.unwrap().to_string(),
        name: room.name,
        invite_code: room.invite_code,
        admin_id: room.admin_id,
        participants: room.participants
            .iter()
            .map(|id| ParticipantInfo {
                id: id.to_string(),
                username: "".to_string(),
                profile_image: None,
            })
            .collect(),
        current_story: room.current_story,
        completed_stories: room.completed_stories,
        stories: room.stories,
        created_at: room.created_at,
        updated_at: now,
    };

    Ok(HttpResponse::Ok().json(room_response))
}

async fn get_participants_info(
    db: &Database,
    participant_ids: &[String]
) -> Result<Vec<ParticipantInfo>, Box<dyn std::error::Error>> {
    let users_collection = db.collection::<User>("users");
    let mut participants_info = Vec::new();

    for id in participant_ids {
        if let Ok(object_id) = mongodb::bson::oid::ObjectId::parse_str(id) {
            if
                let Ok(Some(user)) = users_collection.find_one(
                    doc! { "_id": object_id },
                    None
                ).await
            {
                participants_info.push(ParticipantInfo {
                    id: id.clone(),
                    username: user.username,
                    profile_image: user.profile_image,
                });
            }
        }
    }

    Ok(participants_info)
}

#[get("/rooms/{room_id}")]
pub async fn get_room(
    req: HttpRequest,
    db: web::Data<Database>,
    room_id: web::Path<String>
) -> Result<HttpResponse> {
    let user_id = validate_token(req.clone()).await?;

    let collection = db.collection::<GameRoom>("game_rooms");

    let object_id = mongodb::bson::oid::ObjectId
        ::parse_str(room_id.as_str())
        .map_err(|_| ErrorInternalServerError("Ugyldigt rum ID"))?;

    let room = match
        collection
            .find_one(mongodb::bson::doc! { "_id": object_id }, None).await
            .map_err(ErrorInternalServerError)?
    {
        Some(room) => room,
        None => {
            return Ok(
                HttpResponse::NotFound().json(
                    serde_json::json!({
                "message": "Spilrum ikke fundet"
            })
                )
            );
        }
    };

    // Check if user is in the room
    if !room.participants.contains(&user_id) {
        return Ok(
            HttpResponse::Forbidden().json(
                serde_json::json!({
            "message": "Du har ikke adgang til dette spilrum"
        })
            )
        );
    }

    // Get participant info
    let participants_info = get_participants_info(&db, &room.participants).await.map_err(
        ErrorInternalServerError
    )?;

    let room_response = GameRoomResponse {
        id: room.id.unwrap().to_string(),
        name: room.name,
        invite_code: room.invite_code,
        admin_id: room.admin_id,
        participants: participants_info,
        current_story: room.current_story,
        completed_stories: room.completed_stories,
        stories: room.stories,
        created_at: room.created_at,
        updated_at: room.updated_at,
    };

    Ok(HttpResponse::Ok().json(room_response))
}

pub async fn handle_new_story(
    db: &Database,
    room_id: &str,
    mut story: Story
) -> Result<(), Box<dyn std::error::Error>> {
    println!("handle_new_story kaldt med room_id: {} og historie: {:?}", room_id, story);
    let collection = db.collection::<GameRoom>("game_rooms");

    let object_id = mongodb::bson::oid::ObjectId::parse_str(room_id)?;
    println!("ObjectId parset: {}", object_id);

    // Tilføj ID og timestamp hvis de ikke allerede findes
    if story.id.is_empty() {
        story.id = mongodb::bson::oid::ObjectId::new().to_string();
    }

    // Initialiser votes array hvis den ikke findes
    if story.votes.is_empty() {
        story.votes = Vec::new();
    }

    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;

    let story_bson = mongodb::bson::to_bson(&story)?;
    println!("Historie konverteret til BSON: {:?}", story_bson);

    let update_doc =
        doc! {
        "$set": {
            "current_story": story_bson.clone(),
            "updated_at": now
        },
        "$push": {
            "stories": story_bson
        }
    };
    println!("Update dokument oprettet: {:?}", update_doc);

    let update_result = collection.update_one(doc! { "_id": object_id }, update_doc, None).await?;

    println!("Database opdatering resultat - modified_count: {}", update_result.modified_count);

    if update_result.modified_count == 0 {
        println!("ADVARSEL: Ingen dokumenter blev opdateret!");
        // Lad os tjekke om rummet overhovedet eksisterer
        let room = collection.find_one(doc! { "_id": object_id }, None).await?;
        println!("Rum findes: {}", room.is_some());
        return Err("Kunne ikke opdatere rummet med den nye historie".into());
    }

    println!("Historie gemt succesfuldt i databasen");
    Ok(())
}

pub async fn handle_vote(
    db: &Database,
    room_id: &str,
    user_id: &str,
    story_id: &str,
    value: i32
) -> Result<(), Box<dyn std::error::Error>> {
    println!(
        "handle_vote kaldt med room_id: {}, user_id: {}, story_id: {}, value: {}",
        room_id,
        user_id,
        story_id,
        value
    );
    let collection = db.collection::<GameRoom>("game_rooms");
    let users_collection = db.collection::<User>("users");

    let object_id = mongodb::bson::oid::ObjectId::parse_str(room_id)?;
    println!("ObjectId parset: {}", object_id);

    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;

    // Hent brugerens information
    let user_object_id = mongodb::bson::oid::ObjectId::parse_str(user_id)?;
    let user = users_collection
        .find_one(doc! { "_id": user_object_id }, None).await?
        .ok_or("Bruger ikke fundet")?;

    let vote = Vote {
        user_id: user_id.to_string(),
        username: user.username,
        profile_image: user.profile_image,
        value,
        timestamp: now,
    };

    // Opdater current_story.votes array
    let update_result = collection.update_one(
        doc! { 
                "_id": object_id,
                "current_story.id": story_id
            },
        doc! {
                "$push": {
                    "current_story.votes": mongodb::bson::to_bson(&vote)?
                },
                "$set": {
                    "updated_at": now
                }
            },
        None
    ).await?;

    println!("Vote gemt - modified_count: {}", update_result.modified_count);
    Ok(())
}

pub async fn handle_end_voting(
    db: &Database,
    room_id: &str,
    story_id: &str,
    final_score: i32
) -> Result<(), Box<dyn std::error::Error>> {
    println!(
        "handle_end_voting kaldt med room_id: {}, story_id: {}, final_score: {}",
        room_id,
        story_id,
        final_score
    );
    let collection: mongodb::Collection<GameRoom> = db.collection::<GameRoom>("game_rooms");

    let object_id = mongodb::bson::oid::ObjectId::parse_str(room_id)?;
    println!("ObjectId parset: {}", object_id);

    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;

    // Hent den nuværende historie
    let room = collection
        .find_one(doc! { "_id": object_id }, None).await?
        .ok_or("Rum ikke fundet")?;

    let current_story = room.current_story.ok_or("Ingen aktiv historie fundet")?;

    // Opdater historien med den endelige score og flyt den til completed_stories
    let update_result = collection.update_one(
        doc! { "_id": object_id },
        doc! {
                "$push": {
                    "completed_stories": {
                        "id": &current_story.id,
                        "title": &current_story.title,
                        "description": &current_story.description,
                        "votes": &current_story.votes,
                        "final_score": final_score
                    }
                },
                "$set": {
                    "current_story": null,
                    "updated_at": now
                }
            },
        None
    ).await?;

    println!("Afstemning afsluttet - modified_count: {}", update_result.modified_count);
    Ok(())
}

pub async fn handle_save_final_score(
    db: &Database,
    room_id: &str,
    story_json: &serde_json::Value
) -> Result<(), Box<dyn std::error::Error>> {
    println!("handle_save_final_score kaldt med story: {:?}", story_json);
    let rooms_collection = db.collection::<GameRoom>("game_rooms");
    let completed_stories_collection = db.collection::<CompletedStory>("completed_stories");

    let object_id = mongodb::bson::oid::ObjectId::parse_str(room_id)?;
    println!("ObjectId parset: {}", object_id);

    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;

    // Opret en ny historie med et nyt ID
    let story_id = mongodb::bson::oid::ObjectId::new().to_string();

    // Udtræk data fra story_json
    let story_obj = story_json.as_object().ok_or("Story er ikke et gyldigt objekt")?;

    let title = story_obj
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or("Manglende titel")?
        .to_string();

    let description = story_obj
        .get("description")
        .and_then(|v| v.as_str())
        .ok_or("Manglende beskrivelse")?
        .to_string();

    let votes = story_obj
        .get("votes")
        .and_then(|v| serde_json::from_value::<Vec<Vote>>(v.clone()).ok())
        .unwrap_or_default();

    let final_score = story_obj
        .get("final_score")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32)
        .unwrap_or(0);

    // Opret completed_story
    let completed_story = CompletedStory {
        id: None,
        story_id: story_id.clone(),
        room_id: room_id.to_string(),
        title: title.clone(),
        description: Some(description.clone()),
        votes: votes.clone(),
        final_score,
        completed_at: now,
    };

    println!("Forsøger at gemme completed_story: {:?}", completed_story);

    let insert_result = completed_stories_collection.insert_one(&completed_story, None).await?;
    println!(
        "Historie gemt i completed_stories collection med id: {:?}",
        insert_result.inserted_id
    );

    // Send den gemte historie via WebSocket
    if let Some(game_server) = GAME_SERVER.lock().unwrap().as_ref() {
        let completed_story = CompletedStory {
            id: Some(insert_result.inserted_id.as_object_id().unwrap()),
            story_id,
            room_id: room_id.to_string(),
            title,
            description: Some(description.clone()),
            votes,
            final_score,
            completed_at: now,
        };

        // Konverter til en version med string id før vi sender via WebSocket
        let websocket_story =
            serde_json::json!({
            "id": completed_story.id.unwrap().to_string(),
            "story_id": completed_story.story_id,
            "room_id": completed_story.room_id,
            "title": completed_story.title,
            "description": completed_story.description,
            "votes": completed_story.votes,
            "final_score": completed_story.final_score,
            "completed_at": completed_story.completed_at
        });

        println!("Sender completed_story besked via WebSocket: {:?}", websocket_story);
        game_server.do_send(GameMessage::CompletedStory {
            story: serde_json::from_value(websocket_story).unwrap(),
        });
    }

    println!("Final score gemt - alt OK");
    Ok(())
}

#[get("/rooms/{room_id}/completed-stories")]
pub async fn get_completed_stories(
    req: HttpRequest,
    db: web::Data<Database>,
    room_id: web::Path<String>
) -> Result<HttpResponse> {
    let user_id = validate_token(req.clone()).await?;

    // Tjek om brugeren har adgang til rummet
    let rooms_collection = db.collection::<GameRoom>("game_rooms");
    let object_id = mongodb::bson::oid::ObjectId
        ::parse_str(room_id.as_str())
        .map_err(|_| ErrorInternalServerError("Ugyldigt rum ID"))?;

    let room = match
        rooms_collection
            .find_one(doc! { "_id": object_id }, None).await
            .map_err(ErrorInternalServerError)?
    {
        Some(room) => room,
        None => {
            return Ok(
                HttpResponse::NotFound().json(
                    serde_json::json!({
                "message": "Spilrum ikke fundet"
            })
                )
            );
        }
    };

    if !room.participants.contains(&user_id) {
        return Ok(
            HttpResponse::Forbidden().json(
                serde_json::json!({
            "message": "Du har ikke adgang til dette spilrum"
        })
            )
        );
    }

    // Hent gemte historier
    let completed_stories_collection = db.collection::<CompletedStory>("completed_stories");
    let mut completed_stories = Vec::new();

    let mut cursor = completed_stories_collection
        .find(doc! { "room_id": room_id.as_str() }, None).await
        .map_err(ErrorInternalServerError)?;

    while let Ok(Some(story)) = cursor.try_next().await {
        completed_stories.push(story);
    }

    Ok(HttpResponse::Ok().json(completed_stories))
}

#[get("/rooms/{room_id}/ws")]
pub async fn room_ws(
    req: HttpRequest,
    room_id: web::Path<String>,
    stream: web::Payload,
    srv: web::Data<actix::Addr<GameServer>>,
    db: web::Data<Database>
) -> Result<HttpResponse> {
    println!("WebSocket forbindelse forsøgt oprettet for rum: {}", room_id);
    println!("Query string: {}", req.query_string());

    // Hent token fra query parameter
    let token = req
        .query_string()
        .split('&')
        .find(|s| s.starts_with("token="))
        .and_then(|s| s.strip_prefix("token="))
        .ok_or_else(|| {
            println!("Ingen token fundet i query string");
            ErrorUnauthorized("Ingen token fundet")
        })?;

    println!("Token fundet i query string");

    // Valider token
    let jwt_secret = std::env::var("JWT_SECRET").map_err(|e| {
        println!("JWT_SECRET fejl: {:?}", e);
        ErrorUnauthorized("JWT_SECRET er ikke konfigureret")
    })?;

    println!("JWT_SECRET hentet fra env");

    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &validation
    ).map_err(|e| {
        println!("Token validering fejlede: {:?}", e);
        ErrorUnauthorized("Ugyldig token")
    })?;

    let user_id = token_data.claims.sub;
    println!("Token valideret succesfuldt. User ID: {}", user_id);

    // Hent brugerinfo
    let users_collection = db.collection::<User>("users");
    let user_object_id = mongodb::bson::oid::ObjectId
        ::parse_str(&user_id)
        .map_err(|_| ErrorInternalServerError("Ugyldigt bruger ID"))?;

    let user = users_collection
        .find_one(doc! { "_id": user_object_id }, None).await
        .map_err(ErrorInternalServerError)?
        .ok_or_else(|| ErrorInternalServerError("Bruger ikke fundet"))?;

    // Opret en ny WebSocket session
    let ws = WebSocketSession::new(
        room_id.into_inner(),
        user_id.clone(),
        user.username,
        user.profile_image,
        srv.get_ref().clone(),
        db.get_ref().clone()
    );

    println!("WebSocket session oprettet, opgraderer forbindelse...");

    // Opgrader HTTP forbindelsen til WebSocket
    ws::start(ws, &req, stream)
}
