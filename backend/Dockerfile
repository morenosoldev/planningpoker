# Use the official Rust image as the base
FROM rust:latest

# Set the working directory
WORKDIR /usr/src/myapp

# Copy the Cargo.toml and Cargo.lock files
COPY Cargo.toml Cargo.lock ./

# Copy the source code
COPY src ./src

# Build the Rust application
RUN cargo build --release

RUN mkdir -p /myapp/uploads

# Expose port 8090 to the outside world
EXPOSE 8090

# ✅ Copy the actual binary name to a predictable path
RUN cp target/release/backend /usr/local/bin/voting-api

# Set the entrypoint command to run the compiled binary
CMD ["voting-api"]