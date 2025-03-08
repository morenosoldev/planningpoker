use mongodb::{Client, Database};
use std::env;

pub async fn init_db() -> Database {
    let uri = env::var("MONGODB_URI").expect("MONGODB_URI must be set");
    let client = Client::with_uri_str(&uri)
        .await
        .expect("Failed to connect to MongoDB");
    
    let db_name = env::var("DATABASE_NAME").expect("DATABASE_NAME must be set");
    client.database(&db_name)
}

pub fn get_jwt_secret() -> String {
    env::var("JWT_SECRET").expect("JWT_SECRET must be set")
} 