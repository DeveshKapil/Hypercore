.PHONY: build run clean

# Kernel module build configuration
obj-m += enable_vmx.o
KDIR := /lib/modules/$(shell uname -r)/build

# Build the Rust program
build:
	cd rustCore && cargo build
	$(MAKE) -C $(KDIR) M=$(PWD)/rustCore/src modules

# Run the Rust program
run:
	cd rustCore && cargo run

# Clean build artifacts
clean:
	rm -f *.o *.ko *.mod *.mod.c *.mod.o *.symvers *.order
	rm -f .*.cmd
	rm -f Module.symvers modules.order
	cd rustCore && cargo clean
	$(MAKE) -C $(KDIR) M=$(PWD)/rustCore/src clean

bootloader:
	cargo install bootimage
	cargo bootimage
	
# Default target
all: build 
