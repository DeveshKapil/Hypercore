#![no_std]
#![feature(abi_x86_interrupt)]
pub mod interrupts;
pub mod vmx;
pub mod process;
pub mod memory;
pub mod graphics;

extern crate alloc;

#[macro_export]
macro_rules! print {
    ($($arg:tt)*) => ({
        #[cfg(feature = "graphics")] {
            $crate::graphics::_print(format_args!($($arg)*));
        }
        #[cfg(not(feature = "graphics"))] {
            // fallback: do nothing or add serial output here
        }
    });
}

#[macro_export]
macro_rules! println {
    () => (print!("\n"));
    ($($arg:tt)*) => (print!("{}\n", format_args!($($arg)*)));
} 