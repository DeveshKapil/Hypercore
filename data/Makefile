all: hypervisor

hypervisor: hypervisor.c
	gcc -o hypervisor hypervisor.c -m64 -march=x86-64

clean:
	rm -f hypervisor