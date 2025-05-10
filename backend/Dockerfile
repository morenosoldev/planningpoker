FROM rust:1.77 as builder

WORKDIR /usr/src/app
COPY backend/ ./ 

RUN cargo build --release

FROM debian:bookworm-slim

WORKDIR /usr/local/bin

COPY --from=builder /usr/src/app/target/release/voting-gubra .
COPY --from=builder /usr/src/app/.env .

RUN apt-get update && apt-get install -y libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*

EXPOSE 8080

CMD ["./voting-gubra"] 