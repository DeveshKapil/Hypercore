#![no_std]
#![no_main]
#![feature(abi_x86_interrupt)]

use bootloader_api::{entry_point, BootInfo};

pub mod interrupts;
pub mod vmx;
pub mod process;
pub mod memory;
pub mod graphics;
pub mod ceph;
pub mod network;
pub mod storage;

pub use storage::{BlockDevice, StorageBackend, BlockStorage, RamDisk};

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

    // Example RAMDISK_MEMORY allocation (must be static and mutable)
    static mut RAMDISK_MEMORY: [u8; 1024 * 1024] = [0; 1024 * 1024]; // 1 MiB RAM disk

    let ramdisk = unsafe { RamDisk::new(&mut RAMDISK_MEMORY, 4096) };
    let storage = BlockStorage::new(ramdisk, 4096);
    *crate::STORAGE.lock() = Some(storage);

    loop {}
}

pub static STORAGE: spin::Mutex<Option<BlockStorage<RamDisk>>> = spin::Mutex::new(None); 