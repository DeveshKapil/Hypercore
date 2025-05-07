#![feature(core_intrinsics)]

use std::alloc::{alloc_zeroed, Layout};
use std::process::Command;
use std::ptr;
use std::arch::asm;

const VMXON_SIZE: usize = 2048;
const VMCS_SIZE: usize = 2048;

// Check if VT-x is supported by the CPU
fn is_vtx_supported() -> bool {
    let ecx: u32;
    unsafe {
        asm!(
            "cpuid",
            in("eax") 1,
            out("ecx") ecx,
            out("ebx") _,
            out("edx") _,
        );
    }
    (ecx & (1 << 5)) != 0
}

// Call the kernel module to enable VMX
fn enable_vmx() {
    println!("Loading kernel module to enable VMX...");
    let _ = Command::new("sudo")
        .arg("insmod")
        .arg("src/enable_vmx.ko")
        .status();
}

// Allocate aligned memory
unsafe fn alloc_aligned(size: usize, align: usize) -> *mut u8 {
    let layout = Layout::from_size_align(size, align).unwrap();
    unsafe { alloc_zeroed(layout) }
}

fn launch_guest() {
    println!("Setting up VMXON region...");

    unsafe {
        let vmxon_region = alloc_aligned(VMXON_SIZE, 4096);
        let vmcs_region = alloc_aligned(VMCS_SIZE, 4096);

        if vmxon_region.is_null() || vmcs_region.is_null() {
            println!("Memory allocation failed!");
            std::process::exit(1);
        }

        let vmxon_physical = vmxon_region as u64;
        let vmcs_physical = vmcs_region as u64;

        // Initialize revision ID (using a dummy value since we can't use __rdmsr)
        let revision_id = 0x1;

        ptr::write(vmxon_region as *mut u32, revision_id);
        ptr::write(vmcs_region as *mut u32, revision_id);

        println!("Executing VMXON...");
        let mut status: u8;
        asm!(
            "vmxon [{0}]",
            "setc {1}",
            in(reg) &vmxon_physical,
            out(reg_byte) status,
            options(nostack, preserves_flags),
        );

        if status != 0 {
            println!("VMXON failed!");
            std::process::exit(1);
        }

        println!("Loading VMCS...");
        asm!(
            "vmptrld [{0}]",
            "setc {1}",
            in(reg) &vmcs_physical,
            out(reg_byte) status,
            options(nostack, preserves_flags),
        );

        if status != 0 {
            println!("VMCS load failed!");
            std::process::exit(1);
        }

        println!("Configuring guest state...");
        let guest_rip: u64 = 0x1000;
        asm!(
            "vmwrite {1}, {0}",
            in(reg) 0x681E_u64,
            in(reg) guest_rip,
        );

        println!("Launching guest with VMLAUNCH...");
        asm!(
            "vmlaunch",
            "setc {0}",
            out(reg_byte) status,
            options(nostack, preserves_flags),
        );

        if status != 0 {
            println!("VMLAUNCH failed! Checking VMX exit reason...");
            let mut exit_reason: u64;
            asm!(
                "vmread {1}, {0}",
                out(reg) exit_reason,
                in(reg) 0x4402_u64,
            );
            println!("VM Exit Reason: 0x{:x}", exit_reason);
        } else {
            println!("Guest launched successfully!");
        }

        println!("Exiting VMX mode...");
        asm!("vmxoff");

        // Memory deallocation skipped here for brevity
    }
}

fn main() {
    if !is_vtx_supported() {
        println!("VT-x is not supported on this CPU.");
        std::process::exit(1);
    }
    println!("VT-x is supported. Enabling VMX...");
    enable_vmx();
    launch_guest();
}
