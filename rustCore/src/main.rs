#![no_std]
#![no_main]
#![feature(custom_test_frameworks)]
#![test_runner(hypervisor::test_runner)]
#![reexport_test_harness_main = "test_main"]

use core::panic::PanicInfo;
use bootloader::{BootInfo, entry_point};

entry_point!(kernel_main);

fn kernel_main(boot_info: &'static BootInfo) -> ! {
    hypervisor::init();
    hypervisor::hlt_loop();
}

#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    hypervisor::test_panic_handler(info)
}

#[cfg(test)]
fn test_runner(tests: &[&dyn Fn()]) {
    hypervisor::test_runner(tests);
}

#[cfg(test)]
#[no_mangle]
pub extern "C" fn _start() -> ! {
    test_main();
    loop {}
}

#[cfg(test)]
#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    hypervisor::test_panic_handler(info)
}
