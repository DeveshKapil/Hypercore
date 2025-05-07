use core::arch::asm;

const VMXON_SIZE: usize = 4096;
const VMCS_SIZE: usize = 4096;

pub fn init() {
    if !is_vtx_supported() {
        panic!("VT-x is not supported on this CPU");
    }
    
    enable_vmx();
    setup_vmx();
}

pub fn is_vtx_supported() -> bool {
    let mut ecx: u32;
    unsafe {
        asm!(
            "cpuid",
            in("eax") 1,
            out("ecx") ecx,
            out("edx") _,
            options(nostack, preserves_flags),
        );
    }
    (ecx & (1 << 5)) != 0
}

pub fn enable_vmx() {
    let mut cr4: u64;
    unsafe {
        asm!("mov {}, cr4", out(reg) cr4);
        cr4 |= 1 << 13; // Set VMXE bit
        asm!("mov cr4, {}", in(reg) cr4);
    }
}

pub fn setup_vmx() {
    unsafe {
        // Allocate VMXON region
        let vmxon_region = alloc_aligned(VMXON_SIZE);
        if vmxon_region.is_null() {
            panic!("Failed to allocate VMXON region");
        }

        // Initialize VMXON region
        let revision_id = get_vmx_revision_id();
        *(vmxon_region as *mut u32) = revision_id;

        // Execute VMXON
        let mut status: u8;
        asm!(
            "vmxon [{0}]",
            "setc {1}",
            in(reg) vmxon_region,
            out(reg_byte) status,
            options(nostack, preserves_flags),
        );

        if status != 0 {
            panic!("VMXON failed");
        }
    }
}

pub fn get_vmx_revision_id() -> u32 {
    let mut eax: u32;
    unsafe {
        asm!(
            "vmxoff",
            "mov eax, 0",
            "cpuid",
            out("eax") eax,
            out("edx") _,
            options(nostack, preserves_flags),
        );
    }
    eax
}

pub unsafe fn alloc_aligned(size: usize) -> *mut u8 {
    let mut addr: *mut u8 = core::ptr::null_mut();
    unsafe {
        asm!(
            "mov rax, 9", // mmap syscall
            "mov rdi, 0", // addr (NULL)
            "mov rsi, {size}",
            "mov rdx, 3", // PROT_READ | PROT_WRITE
            "mov r10, 34", // MAP_PRIVATE | MAP_ANONYMOUS
            "mov r8, -1", // fd (-1)
            "mov r9, 0", // offset (0)
            "syscall",
            "mov {addr}, rax",
            size = in(reg) size,
            addr = out(reg) addr,
            options(nostack, preserves_flags),
        );
    }
    addr
} 