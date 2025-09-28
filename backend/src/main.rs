mod config;
mod models;
mod handlers;
mod middleware;
mod websocket;

use actix::Actor;
use actix_cors::Cors;
use actix_web::{ web, App, HttpServer };
use dotenv::dotenv;
use handlers::auth::{ login, register, get_me };
use handlers::game_room::{ create_room, join_room, join_room_by_id, get_room, room_ws };
use websocket::GameServer;
use mongodb::Client;
use crate::handlers::{ auth, game_room };
use crate::websocket::{ GAME_SERVER };

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv::dotenv().ok();
    env_logger::init();

    let jwt_secret = std::env::var("JWT_SECRET").expect("JWT_SECRET skal være sat");
    let mongodb_uri = std::env::var("MONGODB_URI").expect("MONGODB_URI skal være sat");

    println!("Attempting to connect to MongoDB...");
    println!("MongoDB URI (masked): {}", mongodb_uri.chars().take(20).collect::<String>() + "...");

    let client = Client::with_uri_str(&mongodb_uri).await
        .map_err(|e| {
            eprintln!("MongoDB connection error: {:?}", e);
            eprintln!("Full MongoDB URI for debugging: {}", mongodb_uri);
            e
        })
        .expect("Kunne ikke oprette forbindelse til MongoDB");

    // Test the connection
    match client.list_database_names(None, None).await {
        Ok(_) => println!("Successfully connected to MongoDB!"),
        Err(e) => {
            eprintln!("Failed to list databases: {:?}", e);
            panic!("MongoDB connection test failed");
        }
    }
    let db = client.database("planning_poker");

    // Debug: Show current working directory
    match std::env::current_dir() {
        Ok(dir) => println!("Current working directory: {:?}", dir),
        Err(e) => eprintln!("Could not get current directory: {:?}", e),
    }

    // Create uploads directory if it doesn't exist
    match std::fs::create_dir_all("uploads") {
        Ok(_) => {
            println!("Uploads directory created/verified successfully");
            // Check if we can write to it
            match std::fs::metadata("uploads") {
                Ok(metadata) =>
                    println!("Uploads directory permissions: {:?}", metadata.permissions()),
                Err(e) => eprintln!("Could not check uploads directory metadata: {:?}", e),
            }
        }
        Err(e) => {
            eprintln!("Error: Could not create uploads directory: {:?}", e);
            eprintln!("This may cause profile image uploads to fail!");
        }
    }

    let game_server = GameServer::new();
    let game_server_addr = game_server.clone().start();
    *GAME_SERVER.lock().unwrap() = Some(game_server_addr.clone());

    HttpServer::new(move || {
        App::new()
            .wrap(
                Cors::default()
                    .allowed_origin("https://www.estimer.dk")
                    .allowed_origin("https://estimer.dk")
                    .allowed_origin("http://localhost:5173")
                    .allowed_origin("http://127.0.0.1:5173")
                    .allowed_methods(vec!["GET", "POST", "PUT", "OPTIONS"])
                    .allowed_headers(
                        vec![
                            actix_web::http::header::AUTHORIZATION,
                            actix_web::http::header::CONTENT_TYPE
                        ]
                    )
                    .supports_credentials()
                    .max_age(3600)
            )
            .app_data(web::Data::new(db.clone()))
            .app_data(web::Data::new(game_server_addr.clone()))
            .service(auth::register)
            .service(auth::login)
            .service(auth::get_me)
            .service(game_room::create_room)
            .service(game_room::guest_join_room)
            .service(game_room::guest_create_room)
            .service(game_room::join_room)
            .service(game_room::join_room_by_id)
            .service(game_room::get_room)
            .service(game_room::get_room_info)
            .service(game_room::get_completed_stories)
            .service(game_room::room_ws)
            .service(game_room::guest_room_ws)
            .service(handlers::user::upload_profile_image)
            .service(actix_files::Files::new("/uploads", "uploads").show_files_listing())
    })
        .bind("0.0.0.0:8080")?
        .run().await
}
