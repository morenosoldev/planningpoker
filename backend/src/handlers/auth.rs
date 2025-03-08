use actix_web::{post, get, web, HttpResponse, Result, error::ErrorInternalServerError};
use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{encode, EncodingKey, Header};
use mongodb::Database;
use serde::{Deserialize, Serialize};
use crate::models::user::{User, CreateUserDto, LoginDto, AuthResponse, UserResponse};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    exp: usize,
}

#[post("/auth/register")]
pub async fn register(
    db: web::Data<Database>,
    user_data: web::Json<CreateUserDto>,
) -> Result<HttpResponse> {
    let collection = db.collection::<User>("users");
    
    // Check if user already exists
    if let Ok(Some(_)) = collection
        .find_one(
            mongodb::bson::doc! { "email": &user_data.email },
            None,
        )
        .await
    {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "message": "Bruger med denne email findes allerede"
        })));
    }

    // Hash password
    let password_hash = hash(user_data.password.as_bytes(), DEFAULT_COST)
        .map_err(ErrorInternalServerError)?;

    // Create new user
    let new_user = User {
        id: None,
        email: user_data.email.clone(),
        username: user_data.username.clone(),
        password_hash,
        profile_image: user_data.profile_image.clone(),
    };

    // Insert user into database
    let insert_result = collection.insert_one(&new_user, None).await
        .map_err(ErrorInternalServerError)?;

    // Generate JWT
    let token = create_jwt(insert_result.inserted_id.as_object_id().unwrap().to_string())?;

    let user_response = UserResponse {
        id: insert_result.inserted_id.as_object_id().unwrap().to_string(),
        email: new_user.email,
        username: new_user.username,
        profile_image: new_user.profile_image,
    };

    Ok(HttpResponse::Ok().json(AuthResponse {
        token,
        user: user_response,
    }))
}

#[post("/auth/login")]
pub async fn login(
    db: web::Data<Database>,
    login_data: web::Json<LoginDto>,
) -> Result<HttpResponse> {
    let collection = db.collection::<User>("users");
    println!("Login data: {:?}", login_data);
    println!("Email: {:?}", login_data.email);
    // Find user by email
    let user = match collection
        .find_one(
            mongodb::bson::doc! { "email": &login_data.email },
            None,
        )
        .await
        .map_err(ErrorInternalServerError)?
    {
        Some(user) => user,
        None => {
            return Ok(HttpResponse::Unauthorized().json(serde_json::json!({
                "message": "Ugyldig email eller adgangskode"
            })));
        }
    };
    println!("User: {:?}", user);

    // Verify password
    if !verify(&login_data.password, &user.password_hash)
        .map_err(ErrorInternalServerError)?
    {
        return Ok(HttpResponse::Unauthorized().json(serde_json::json!({
            "message": "Ugyldig email eller adgangskode"
        })));
    }

    // Generate JWT
    let token = create_jwt(user.id.unwrap().to_string())?;

    let user_response = UserResponse {
        id: user.id.unwrap().to_string(),
        email: user.email,
        username: user.username,
        profile_image: user.profile_image,
    };

    Ok(HttpResponse::Ok().json(AuthResponse {
        token,
        user: user_response,
    }))
}

#[get("/auth/me")]
pub async fn get_me(
    db: web::Data<Database>,
    user_id: String,
) -> Result<HttpResponse> {
    let collection = db.collection::<User>("users");
    
    let object_id = mongodb::bson::oid::ObjectId::parse_str(&user_id)
        .map_err(|_| ErrorInternalServerError("Ugyldigt bruger ID"))?;

    // Find user by ID
    let user = match collection
        .find_one(
            mongodb::bson::doc! { "_id": object_id },
            None,
        )
        .await
        .map_err(ErrorInternalServerError)?
    {
        Some(user) => user,
        None => {
            return Ok(HttpResponse::NotFound().json(serde_json::json!({
                "message": "Bruger ikke fundet"
            })));
        }
    };

    let user_response = UserResponse {
        id: user.id.unwrap().to_string(),
        email: user.email,
        username: user.username,
        profile_image: user.profile_image,
    };

    Ok(HttpResponse::Ok().json(user_response))
}

fn create_jwt(user_id: String) -> Result<String> {
    let expiration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize + 24 * 3600; // 24 timer

    let claims = Claims {
        sub: user_id,
        exp: expiration,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(std::env::var("JWT_SECRET").expect("JWT_SECRET skal være sat").as_bytes()),
    )
    .map_err(ErrorInternalServerError)?;

    Ok(token)
} 