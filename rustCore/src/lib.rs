// Updated for modern bootloader and graphics support.
#![no_std]
#![no_main]
#![feature(abi_x86_interrupt)]

use bootloader::{entry_point, BootInfo};

pub mod interrupts;
pub mod vmx;
pub mod process;
pub mod memory;
pub mod graphics;



extern crate alloc;


entry_point!(kernel_main);

fn kernel_main(_boot_info: &'static BootInfo) -> ! {
    #[cfg(feature = "graphics")]
    if let Some(framebuffer) = boot_info.framebuffer.as_ref() {
        let info = framebuffer.info();
        let fb_addr = framebuffer.buffer().as_ptr() as *mut u8;
        let width = info.width;
        let height = info.height;
        let pitch = info.stride * 4; // 4 bytes per pixel for 32bpp
        let bpp = 32;
        let mut writer = crate::graphics::FramebufferWriter::new(fb_addr, width, height, pitch, bpp);
        // Now you can draw pixels!
    }
    loop {}
} 