#![no_std]
#![no_main]
#![feature(abi_x86_interrupt)]

use bootloader::{entry_point, BootInfo};
use crate::graphics::FramebufferWriter;

pub mod interrupts;
pub mod vmx;
pub mod process;
pub mod memory;
pub mod graphics;

extern crate alloc;

entry_point!(kernel_main);

