// Minimal memory management module
// Only core logic, no LRU or advanced caching

use x86_64::structures::paging::{PhysFrame, Size4KiB, FrameAllocator};
use x86_64::PhysAddr;
use alloc::vec::Vec;
//use x86_64::structures::paging::mapper::UnmapError;
pub mod paging;
pub struct SimpleFrameAllocator {
    next: u64,
    end: u64,
    free_list: Vec<u64>,
}

impl SimpleFrameAllocator {
    pub fn new(start: u64, end: u64) -> Self {
        SimpleFrameAllocator { next: start, end, free_list: Vec::new() }
    }

    pub fn deallocate_frame(&mut self, frame: PhysFrame<Size4KiB>) {
        self.free_list.push(frame.start_address().as_u64());
    }
}

unsafe impl FrameAllocator<Size4KiB> for SimpleFrameAllocator {
    fn allocate_frame(&mut self) -> Option<PhysFrame<Size4KiB>> {
        if let Some(addr) = self.free_list.pop() {
            Some(PhysFrame::containing_address(PhysAddr::new(addr)))
        } else if self.next < self.end {
            let frame = PhysFrame::containing_address(PhysAddr::new(self.next));
            self.next += 4096;
            Some(frame)
        } else {
            None
        }
    }
}

pub mod lru;
pub mod manager; 
