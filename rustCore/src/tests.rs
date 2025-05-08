use crate::println;
use crate::memory::{SimpleFrameAllocator};

#[test_case]
fn test_print() {
    println!("Hello, test!");
}

#[test_case]
fn test_frame_allocator() {
    let mut allocator = SimpleFrameAllocator::new(0x1000, 0x3000);
    assert!(allocator.allocate_frame().is_some());
    assert!(allocator.allocate_frame().is_some());
    assert!(allocator.allocate_frame().is_none());
} 