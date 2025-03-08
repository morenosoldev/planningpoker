use actix_web::{post, web, HttpResponse, Result, error::ResponseError, Error as ActixError};
use actix_multipart::{Multipart, MultipartError};
use futures_util::TryStreamExt;
use uuid::Uuid;
use std::io::Write;
use image::ImageFormat;
use mongodb::Database;
use crate::models::user::User;
use crate::middleware::auth::validate_token;
use mongodb::bson::doc;
use std::fmt;
use actix_web::error::BlockingError;

#[derive(Debug)]
pub enum UserError {
    ImageError(image::ImageError),
    MongoError(mongodb::error::Error),
    BsonError(mongodb::bson::oid::Error),
    IoError(std::io::Error),
    ActixError(ActixError),
    MultipartError(MultipartError),
    BlockingError,
}

impl fmt::Display for UserError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            UserError::ImageError(e) => write!(f, "Billedfejl: {}", e),
            UserError::MongoError(e) => write!(f, "Database fejl: {}", e),
            UserError::BsonError(e) => write!(f, "BSON fejl: {}", e),
            UserError::IoError(e) => write!(f, "IO fejl: {}", e),
            UserError::ActixError(e) => write!(f, "Actix fejl: {}", e),
            UserError::MultipartError(e) => write!(f, "Multipart fejl: {}", e),
            UserError::BlockingError => write!(f, "Blocking operation fejl"),
        }
    }
}

impl ResponseError for UserError {
    fn error_response(&self) -> HttpResponse {
        HttpResponse::InternalServerError().json(serde_json::json!({
            "error": self.to_string()
        }))
    }
}

impl From<image::ImageError> for UserError {
    fn from(err: image::ImageError) -> Self {
        UserError::ImageError(err)
    }
}

impl From<mongodb::error::Error> for UserError {
    fn from(err: mongodb::error::Error) -> Self {
        UserError::MongoError(err)
    }
}

impl From<mongodb::bson::oid::Error> for UserError {
    fn from(err: mongodb::bson::oid::Error) -> Self {
        UserError::BsonError(err)
    }
}

impl From<std::io::Error> for UserError {
    fn from(err: std::io::Error) -> Self {
        UserError::IoError(err)
    }
}

impl From<ActixError> for UserError {
    fn from(err: ActixError) -> Self {
        UserError::ActixError(err)
    }
}

impl From<MultipartError> for UserError {
    fn from(err: MultipartError) -> Self {
        UserError::MultipartError(err)
    }
}

impl From<BlockingError> for UserError {
    fn from(_: BlockingError) -> Self {
        UserError::BlockingError
    }
}

#[post("/users/profile-image")]
pub async fn upload_profile_image(
    req: actix_web::HttpRequest,
    mut payload: Multipart,
    db: web::Data<Database>,
) -> Result<HttpResponse, UserError> {
    // Valider bruger
    let user_id = validate_token(req).await?;
    
    // Opret uploads mappe hvis den ikke findes
    std::fs::create_dir_all("uploads")?;
    
    // Håndter fil upload
    while let Some(mut field) = payload.try_next().await? {
        // Generer unikt filnavn
        let file_id = Uuid::new_v4();
        let file_path = format!("uploads/{}.jpg", file_id);
        
        // Opret fil
        let file_path_clone = file_path.clone();
        let mut f = web::block(move || std::fs::File::create(&file_path_clone))
            .await
            .map_err(|e: BlockingError| UserError::BlockingError)?
            .map_err(UserError::IoError)?;
        
        // Skriv data til fil
        while let Some(chunk) = field.try_next().await? {
            let chunk_data = chunk.to_vec();
            f = web::block(move || f.write_all(&chunk_data).map(|_| f))
                .await
                .map_err(|e: BlockingError| UserError::BlockingError)?
                .map_err(UserError::IoError)?;
        }
        
        // Optimer billede
        let img = image::open(&file_path)?;
        let resized = img.resize(200, 200, image::imageops::FilterType::Lanczos3);
        resized.save(&file_path)?;
        
        // Opdater bruger i database
        let users_collection = db.collection::<User>("users");
        let object_id = mongodb::bson::oid::ObjectId::parse_str(&user_id)?;
        
        users_collection
            .update_one(
                doc! { "_id": object_id },
                doc! { "$set": { "profile_image": format!("/uploads/{}.jpg", file_id) } },
                None,
            )
            .await?;
        
        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "message": "Profilbillede opdateret",
            "profile_image": format!("/uploads/{}.jpg", file_id)
        })));
    }
    
    Ok(HttpResponse::BadRequest().json(serde_json::json!({
        "message": "Ingen fil modtaget"
    })))
} 