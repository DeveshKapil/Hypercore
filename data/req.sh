#!/bin/bash

set -x  # Enable debugging
set -e  # Exit on error

echo "Updating package lists..."
sudo apt update

echo "Installing essential development tools..."
sudo apt install -y \
    build-essential \
    git \
    nasm \
    qemu-system-x86 \
    gdb \
    xorriso \
    mtools \
    libglib2.0-dev \
    libfdt-dev \
    libpixman-1-dev \
    flex \
    bison \
    pkg-config \
    cmake \
    clang \
    llvm \
    python3 \
    python3-pip \
    hexedit \
    vim \
    tmux

set +x  # Disable debugging