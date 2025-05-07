#include <linux/module.h>
#include <linux/kernel.h>
#include <asm/msr.h>

static int __init enable_vmx_init(void) {
    unsigned long cr4;

    pr_info("Enabling VMX...\n");

    // Read CR4
    cr4 = __read_cr4();

    // Set VMXE (bit 13)+
    cr4 |= X86_CR4_VMXE;

    // Write back to CR4
    __write_cr4(cr4);

    pr_info("VMX enabled successfully.\n");
    return 0;
}

static void __exit enable_vmx_exit(void) {
    pr_info("VMX enable module unloaded.\n");
}

module_init(enable_vmx_init);
module_exit(enable_vmx_exit);

MODULE_LICENSE("GPL");
MODULE_AUTHOR("Devesh");
MODULE_DESCRIPTION("Enable VMX (VT-x) in Kernel Mode");
