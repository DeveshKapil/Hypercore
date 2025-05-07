obj-m += enable_vmx.o

all:
	make -C /lib/modules/$(shell uname -r)/build M=/home/dev/Hypercore-1/rustCore/src modules

clean:
	make -C /lib/modules/$(shell uname -r)/build M=/home/dev/Hypercore-1/rustCore/src clean 