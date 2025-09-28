use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub email: String,
    pub username: String,
    pub password_hash: String,
    #[serde(default)]
    pub profile_image: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserDto {
    pub email: String,
    pub username: String,
    pub password: String,
    pub profile_image: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginDto {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserResponse,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: String,
    pub email: String,
    pub username: String,
    pub profile_image: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GuestUser {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<mongodb::bson::oid::ObjectId>,
    pub username: String,
    pub profile_image: Option<String>,
    pub is_guest: bool,
}

#[derive(Debug, Deserialize)]
pub struct GuestJoinDto {
    pub username: String,
    pub room_code: String,
} 