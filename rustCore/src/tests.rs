use crate::{vmx, memory, interrupts, println};
use bootloader::{BootInfo, entry_point};
use x86_64::VirtAddr;
use crate::print;
use crate::println;
use alloc::boxed::Box;
entry_point!(test_kernel_main);

fn test_kernel_main(boot_info: &'static BootInfo) -> ! {
    println!("Starting hypervisor tests...");

    // Test VT-x support
    println!("Testing VT-x support...");
    assert!(vmx::is_vtx_supported(), "VT-x should be supported");

    // Test memory initialization
    println!("Testing memory initialization...");
    let page_table = unsafe { memory::init(boot_info) };
    assert!(page_table.phys_offset() == VirtAddr::new(boot_info.physical_memory_offset),
            "Page table initialization failed");

    // Test VMX initialization
    println!("Testing VMX initialization...");
    vmx::init();
    println!("VMX initialization successful");

    // Test interrupt handling
    println!("Testing interrupt handling...");
    interrupts::init_idt();
    println!("Interrupt handling initialized");

    println!("All tests passed!");
    crate::exit_qemu(crate::QemuExitCode::Success);
    loop {}
}

#[test_case]
fn test_vtx_support() {
    assert!(vmx::is_vtx_supported());
}

#[test_case]
fn test_memory_allocation() {
    let size = 4096;
    let ptr = unsafe { vmx::alloc_aligned(size) };
    assert!(!ptr.is_null(), "Memory allocation failed");
} 