use x86_64::structures::idt::{InterruptDescriptorTable, InterruptStackFrame};
use lazy_static::lazy_static;


#[macro_export]
macro_rules! println {
    () => ({
        #[cfg(feature = "graphics")] {
            $crate::graphics::_print(format_args!("\n"));
        }
        #[cfg(not(feature = "graphics"))] {
            // fallback: do nothing or add serial output here
        }
    });
    ($($arg:tt)*) => ({
        #[cfg(feature = "graphics")] {
            $crate::graphics::_print(format_args!("{}\n", format_args!($($arg)*)));
        }
        #[cfg(not(feature = "graphics"))] {
            // fallback: do nothing or add serial output here
        }
    });
}

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


lazy_static! {
    static ref IDT: InterruptDescriptorTable = {
        let mut idt = InterruptDescriptorTable::new();
        idt.breakpoint.set_handler_fn(breakpoint_handler);
        idt.page_fault.set_handler_fn(page_fault_handler);
        idt.double_fault.set_handler_fn(double_fault_handler);
        idt
    };
}

pub fn init_idt() {
    IDT.load();
}

extern "x86-interrupt" fn breakpoint_handler(
    _stack_frame: InterruptStackFrame)
{
    println!("EXCEPTION: BREAKPOINT\n{:#?}", stack_frame);
}

extern "x86-interrupt" fn page_fault_handler(
    stack_frame: InterruptStackFrame,
    error_code: x86_64::structures::idt::PageFaultErrorCode,
) {
    use x86_64::registers::control::Cr2;
    let addr = Cr2::read().as_u64();
    crate::memory::paging::handle_page_fault(addr, error_code.bits());
    crate::println!("EXCEPTION: PAGE FAULT");
    crate::println!("Accessed Address: {:?}", addr);
    crate::println!("Error Code: {:?}", error_code);
    crate::println!("{:#?}", stack_frame);
    loop {}
}

extern "x86-interrupt" fn double_fault_handler(
    stack_frame: InterruptStackFrame, _error_code: u64) -> !
{
    panic!("EXCEPTION: DOUBLE FAULT\n{:#?}", stack_frame);
} 
