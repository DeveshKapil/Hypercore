#include "vmx.h"
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <x86intrin.h>

#define VMXON_SIZE 2048
#define VMCS_SIZE  2048

// Check if VT-x is supported by the CPU
int is_vtx_supported() {
    uint32_t ecx;
    __asm__ __volatile__(
        "cpuid"
        : "=c"(ecx)         // Output: ECX register
        : "a"(1)            // Input: EAX = 1 (processor info)
        : "ebx", "edx"      // Clobbered registers
    );
    return (ecx & (1 << 5)) != 0;  // Bit 5 of ECX indicates VT-x support
}

// Call the kernel module to enable VMX
void enable_vmx() {
    printf("Loading kernel module to enable VMX...\n");
    system("sudo insmod enable_vmx.ko");  // Load the kernel module
}

// Placeholder for launching a guest (simplified)

void launch_guest() {
    printf("Setting up VMXON region...\n");

    // Allocate aligned memory for VMXON and VMCS
    void *vmxon_region = aligned_alloc(4096, VMXON_SIZE);
    void *vmcs_region = aligned_alloc(4096, VMCS_SIZE);

    if (!vmxon_region || !vmcs_region) {
        printf("Memory allocation failed!\n");
        exit(1);
    }

    memset(vmxon_region, 0, VMXON_SIZE);
    memset(vmcs_region, 0, VMCS_SIZE);

    uint64_t vmxon_physical = (uint64_t) vmxon_region;
    uint64_t vmcs_physical = (uint64_t) vmcs_region;

    // Read IA32_VMX_BASIC MSR to get required VMXON revision ID
    uint64_t vmx_basic = __rdmsr(0x480); 
    uint32_t revision_id = (uint32_t)vmx_basic;

    // Store revision ID in VMXON and VMCS regions
    *(uint32_t*)vmxon_region = revision_id;
    *(uint32_t*)vmcs_region = revision_id;

    // Execute VMXON
    printf("Executing VMXON...\n");
    uint8_t status;
    __asm__ __volatile__(
        "vmxon %1; setc %0"
        : "=r"(status)
        : "m"(vmxon_physical)
        : "cc", "memory"
    );

    if (status) {
        printf("VMXON failed!\n");
        exit(1);
    }

    // Load VMCS
    printf("Loading VMCS...\n");
    __asm__ __volatile__(
        "vmptrld %1; setc %0"
        : "=r"(status)
        : "m"(vmcs_physical)
        : "cc", "memory"
    );

    if (status) {
        printf("VMCS load failed!\n");
        exit(1);
    }

    // Set up guest state (minimal example)
    printf("Configuring guest state...\n");
    uint64_t guest_rip = 0x1000;  // Set guest instruction pointer
    __asm__ __volatile__("vmwrite %1, %0" :: "r"(0x681E), "r"(guest_rip));

    // Launch guest
    printf("Launching guest with VMLAUNCH...\n");
    __asm__ __volatile__(
        "vmlaunch; setc %0"
        : "=r"(status)
        :
        : "cc", "memory"
    );

    if (status) {
        printf("VMLAUNCH failed! Checking VMX exit reason...\n");
        uint64_t exit_reason;
        __asm__ __volatile__("vmread %1, %0" : "=r"(exit_reason) : "r"(0x4402));
        printf("VM Exit Reason: 0x%lx\n", exit_reason);
    } else {
        printf("Guest launched successfully!\n");
    }

    // Cleanup
    printf("Exiting VMX mode...\n");
    __asm__ __volatile__("vmxoff");

    free(vmxon_region);
    free(vmcs_region);
}

int main() {
    if (!is_vtx_supported()) {
        printf("VT-x is not supported on this CPU.\n");
        return 1;
    }
    printf("VT-x is supported. Enabling VMX...\n");
    enable_vmx();
    launch_guest();
    return 0;
}