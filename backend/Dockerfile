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

# Create uploads directory in the working directory
RUN mkdir -p uploads

# Expose port 8080 to the outside world
EXPOSE 8080

# ✅ Copy the actual binary name to a predictable path
RUN cp target/release/backend /usr/local/bin/voting-api

# Set the entrypoint command to run the compiled binary
CMD ["voting-api"]