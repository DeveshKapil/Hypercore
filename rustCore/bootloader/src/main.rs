#![no_std]
#![no_main]

use bootloader::entry_point;

entry_point!(main);

fn main(_boot_info: &'static bootloader::BootInfo) -> ! {
    loop {}
} 