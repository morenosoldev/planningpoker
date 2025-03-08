use actix_web::{
    error::ErrorUnauthorized,
    http::header::AUTHORIZATION,
    Error, HttpRequest,
};
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
}

pub async fn validate_token(req: HttpRequest) -> Result<String, Error> {
    println!("Validerer token...");
    println!("Headers: {:?}", req.headers());
    
    let token = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|auth_header| {
            println!("Auth header fundet: {:?}", auth_header);
            auth_header.to_str().ok()
        })
        .and_then(|auth_str| {
            println!("Auth string: {}", auth_str);
            auth_str.strip_prefix("Bearer ")
        })
        .ok_or_else(|| {
            println!("Ingen token fundet i header");
            ErrorUnauthorized("Ingen token fundet")
        })?;

    println!("Token efter strip_prefix: {}", token);

    let jwt_secret = std::env::var("JWT_SECRET")
        .map_err(|e| {
            println!("JWT_SECRET fejl: {:?}", e);
            ErrorUnauthorized("JWT_SECRET er ikke konfigureret")
        })?;
    
    println!("JWT_SECRET hentet fra env: {}", jwt_secret);
    
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &validation,
    )
    .map_err(|e| {
        println!("Token validering fejlede: {:?}", e);
        ErrorUnauthorized("Ugyldig token")
    })?;

    println!("Token valideret succesfuldt. User ID: {}", token_data.claims.sub);
    Ok(token_data.claims.sub)
} 