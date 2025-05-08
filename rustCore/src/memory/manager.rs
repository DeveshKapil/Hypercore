use x86_64::structures::paging::{Page, PageTableFlags, Mapper, Size4KiB, FrameAllocator, PhysFrame};
use x86_64::structures::paging::mapper::{MapperFlush, MapToError, UnmapError};
use super::SimpleFrameAllocator;
use super::lru::{LRUCache, PageKey};
use alloc::boxed::Box;
use x86_64::{VirtAddr,PhysAddr};

pub struct MemoryManager<'a, M: Mapper<Size4KiB>> {
    pub mapper: &'a mut M,
    pub frame_allocator: &'a mut SimpleFrameAllocator,
    pub lru: LRUCache,
}

impl<'a, M: Mapper<Size4KiB>> MemoryManager<'a, M> {
    pub fn map_page(&mut self, page: Page, flags: PageTableFlags) -> Result<MapperFlush<Size4KiB>, MapToError<Size4KiB>> {
        if let Some(frame) = self.frame_allocator.allocate_frame() {
            // SAFETY: caller must ensure the page is unused
            unsafe { self.mapper.map_to(page, frame, flags, self.frame_allocator) }
        } else {
            Err(MapToError::FrameAllocationFailed)
        }
    }

    pub fn evict_and_deallocate(&mut self, address: u64, size: usize) -> Result<(), UnmapError> {
        let key = PageKey { address, size };
        if self.lru.remove(&key).is_some() {
            let page = Page::containing_address(VirtAddr::new(address));
            let (frame, _flush) = self.unmap_page(page)?;
            // Frame is deallocated in unmap_page
            Ok(())
        } else {
            Err(UnmapError::PageNotMapped)
        }
    }

    pub fn unmap_page(&mut self, page: Page) -> Result<(PhysFrame<Size4KiB>, MapperFlush<Size4KiB>), UnmapError> {
        // SAFETY: caller must ensure the page is mapped
        let (frame, flush) = unsafe { self.mapper.unmap(page)? };
        self.frame_allocator.deallocate_frame(frame);
        Ok((frame, flush))
    }

    // LRU cache methods
    pub fn cache_page(&mut self, address: u64, size: usize, data: Box<[u8]>) {
        let key = PageKey { address, size };
        self.lru.put(key, data);
    }

    pub fn get_cached_page(&mut self, address: u64, size: usize) -> Option<&[u8]> {
        let key = PageKey { address, size };
        self.lru.get(&key)
    }

    pub fn remove_cached_page(&mut self, address: u64, size: usize) -> Option<Box<[u8]>> {
        let key = PageKey { address, size };
        self.lru.remove(&key)
    }
} 