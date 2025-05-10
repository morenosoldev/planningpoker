# Use Rust 1.77 for lock file v4 compatibility
FROM rust:1.77 AS builder

WORKDIR /usr/src/app

# Only copy files from the build context (which is `backend/`)
COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN cargo build --release

# Use a slim Debian image for final output
FROM debian:bookworm-slim

WORKDIR /usr/local/bin

# Copy the built binary (adjust name if needed)
COPY --from=builder /usr/src/app/target/release/backend ./voting-gubra


# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libssl-dev \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 8080

CMD ["./voting-gubra"]
