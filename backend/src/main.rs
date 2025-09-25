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

    let client = Client::with_uri_str(&mongodb_uri).await.expect(
        "Kunne ikke oprette forbindelse til MongoDB"
    );
    let db = client.database("planning_poker");

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
            .service(game_room::join_room)
            .service(game_room::join_room_by_id)
            .service(game_room::get_room)
            .service(game_room::get_completed_stories)
            .service(game_room::room_ws)
            .service(handlers::user::upload_profile_image)
            .service(actix_files::Files::new("/uploads", "uploads").show_files_listing())
    })
        .bind("0.0.0.0:8080")?
        .run().await
}
