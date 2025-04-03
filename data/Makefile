obj-m += enable_vmx.o

all:
	make -C /lib/modules/$(shell uname -r)/build M=$(PWD) modules
	gcc -o hypervisor hypervisor.c -m64 -march=x86-64

clean:
	make -C /lib/modules/$(shell uname -r)/build M=$(PWD) clean
	rm -f hypervisor enable_vmx.ko enable_vmx.mod.o enable_vmx.mod.c enable_vmx.o
