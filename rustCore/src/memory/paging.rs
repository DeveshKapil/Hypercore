pub fn handle_page_fault(_addr: u64, _error_code: u64) {
    // Here you would allocate a page, map it, or kill the process
    // For now, just log
    crate::println!("Page fault at {:#x}, error code: {:#x}", addr, error_code);
}
