use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Vote {
    pub user_id: String,
    pub username: String,
    #[serde(default)]
    pub profile_image: Option<String>,
    pub value: i32,
    pub timestamp: i64,
}

impl From<Vote> for mongodb::bson::Bson {
    fn from(vote: Vote) -> Self {
        mongodb::bson::to_bson(&vote).unwrap()
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Story {
    pub id: String,
    pub room_id: String,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "Vec::new")]
    pub votes: Vec<Vote>,
    #[serde(default)]
    pub final_score: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CompletedStory {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub story_id: String,
    pub room_id: String,
    pub title: String,
    pub description: Option<String>,
    pub votes: Vec<Vote>,
    pub final_score: i32,
    pub completed_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GameRoom {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub name: String,
    pub invite_code: String,
    pub admin_id: String,
    pub participants: Vec<String>, // User IDs
    pub current_story: Option<Story>,
    pub completed_stories: Vec<Story>,
    pub stories: Vec<Story>,  // Alle historier (både aktive og afsluttede)
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateRoomDto {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct JoinRoomDto {
    pub invite_code: String,
}

#[derive(Debug, Serialize)]
pub struct GameRoomResponse {
    pub id: String,
    pub name: String,
    pub invite_code: String,
    pub admin_id: String,
    pub participants: Vec<String>,
    pub current_story: Option<Story>,
    pub completed_stories: Vec<Story>,
    pub stories: Vec<Story>,  // Alle historier (både aktive og afsluttede)
    pub created_at: i64,
    pub updated_at: i64,
} 