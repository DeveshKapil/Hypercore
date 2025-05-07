.PHONY: build run clean

# Build the Rust program
build:
	cd rustCore && cargo build

# Run the Rust program
run:
	cd rustCore && cargo run

# Clean build artifacts
clean:
	cd rustCore && cargo clean

# Default target
all: build 