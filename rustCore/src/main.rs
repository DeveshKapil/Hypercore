#![no_std]
#![no_main]
#![feature(abi_x86_interrupt)]

pub mod interrupts;
pub mod vmx;
pub mod process;
pub mod memory;
pub mod graphics;

extern crate alloc;

