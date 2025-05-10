# Use Rust 1.77 for lock file v4 compatibility
FROM rust:1.77 as builder

# Only copy the backend folder
WORKDIR /usr/src/app
COPY backend/Cargo.toml backend/Cargo.lock ./
COPY backend/src ./src

# Build in release mode
RUN cargo build --release

# Use a slim Debian image for final output
FROM debian:bookworm-slim

WORKDIR /usr/local/bin

# Copy the built binary from the builder stage
COPY --from=builder /usr/src/app/target/release/backend ./voting-gubra

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libssl-dev \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Choose a unique port if running multiple apps on one server
EXPOSE 8080

CMD ["./voting-gubra"]
