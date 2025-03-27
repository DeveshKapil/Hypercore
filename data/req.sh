#!/bin/bash

# Script to install all tools required for developing a bare-metal hypervisor
# Tested on Ubuntu/Debian-based systems

# Exit on error
set -e

echo "Updating package lists..."
sudo apt update

echo "Installing essential development tools..."
sudo apt install -y \
    build-essential \       # GCC, make, etc.
    git \                   # Version control
    nasm \                  # Assembler for writing bootloader code
    qemu-system-x86 \       # QEMU emulator for testing
    gdb \                   # Debugger
    xorriso \               # Tool for creating ISO images
    mtools \                # Tools for working with FAT filesystems
    libglib2.0-dev \        # Required for QEMU development
    libfdt-dev \            # For working with device tree blobs
    libpixman-1-dev \       # Pixel manipulation library for QEMU
    flex \                  # Lexical analyzer generator
    bison \                 # Parser generator
    pkg-config \            # Helper tool for compiler flags
    cmake \                 # Build system
    clang \                 # Alternative compiler
    llvm \                  # LLVM toolchain
    python3 \               # Python interpreter
    python3-pip \           # Python package manager
    hexedit \               # Hex editor for inspecting binaries
    vim \                   # Text editor (optional)
    tmux \                  # Terminal multiplexer (optional)

echo "Installing additional Python packages..."
pip3 install --user pyelftools  # For parsing ELF files

echo "Installing Intel Software Developer Manuals (optional)..."
# Download Intel manuals (requires manual extraction and reading)
mkdir -p ~/intel-manuals
cd ~/intel-manuals
wget https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-instruction-set-reference-manual.pdf
wget https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-system-programming-manual.pdf
wget https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-3a-part-1-manual.pdf
wget https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-3b-part-2-manual.pdf
echo "Intel manuals downloaded to ~/intel-manuals"

echo "Setting up QEMU alias for convenience..."
echo 'alias qemu="qemu-system-x86_64"' >> ~/.bashrc
source ~/.bashrc

echo "All tools installed successfully!"
echo "You are now ready to start developing your bare-metal hypervisor."
