use super::lru::{PageCache, PageKey};
use x86_64::{
    structures::paging::{
        PageTable, OffsetPageTable, PhysFrame, Size4KiB, FrameAllocator,
        Mapper, Page, PageTableFlags, Translate,
    },
    VirtAddr, PhysAddr,
};
use alloc::boxed::Box;
use spin::Mutex;
use core::ops::DerefMut;

pub struct MemoryManager {
    page_table: OffsetPageTable<'static>,
    frame_allocator: Box<dyn FrameAllocator<Size4KiB>>,
    page_cache: PageCache,
}

impl MemoryManager {
    pub fn new(
        page_table: OffsetPageTable<'static>,
        frame_allocator: Box<dyn FrameAllocator<Size4KiB>>,
        cache_size: usize,
    ) -> Self {
        MemoryManager {
            page_table,
            frame_allocator,
            page_cache: PageCache::new(cache_size),
        }
    }

    pub fn map_page(&mut self, page: Page, flags: PageTableFlags) -> Result<(), &'static str> {
        let frame = self.frame_allocator
            .allocate_frame()
            .ok_or("Failed to allocate frame")?;

        unsafe {
            self.page_table
                .map_to(page, frame, flags, self.frame_allocator.deref_mut())
                .map_err(|_| "Failed to map page")?
                .flush();
        }
        Ok(())
    }

    pub fn unmap_page(&mut self, page: Page) -> Result<(), &'static str> {
        let (frame, _) = unsafe {
            self.page_table
                .unmap(page)
                .map_err(|_| "Failed to unmap page")?
        };
        frame.flush();
        Ok(())
    }

    pub fn cache_page(&self, address: u64, size: usize, data: Box<[u8]>) {
        let mut cache = self.page_cache.lock();
        cache.insert_page(address, size, data);
    }

    pub fn get_cached_page(&self, address: u64, size: usize) -> Option<&[u8]> {
        let mut cache = self.page_cache.lock();
        cache.get_page(address, size)
    }

    pub fn remove_cached_page(&self, address: u64, size: usize) -> Option<Box<[u8]>> {
        let mut cache = self.page_cache.lock();
        cache.remove_page(address, size)
    }

    pub fn clear_cache(&self) {
        let mut cache = self.page_cache.lock();
        cache.clear();
    }

    pub fn translate_addr(&self, addr: VirtAddr) -> Option<PhysAddr> {
        self.page_table.translate(addr)
    }

    pub fn translate_addr_range(
        &self,
        start: VirtAddr,
        size: usize,
    ) -> Option<(PhysAddr, usize)> {
        let start_page = Page::containing_address(start);
        let end_page = Page::containing_address(start + size - 1);

        let start_frame = self.page_table.translate_page(start_page).ok()?;
        let end_frame = self.page_table.translate_page(end_page).ok()?;

        let start_addr = start_frame.start_address();
        let end_addr = end_frame.start_address() + end_frame.size();

        Some((start_addr, (end_addr - start_addr) as usize))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bootloader::BootInfo;

    // Mock frame allocator for testing
    struct MockFrameAllocator {
        frames: Vec<PhysFrame>,
    }

    impl FrameAllocator<Size4KiB> for MockFrameAllocator {
        fn allocate_frame(&mut self) -> Option<PhysFrame<Size4KiB>> {
            self.frames.pop()
        }
    }

    #[test]
    fn test_memory_manager() {
        // Create a mock frame allocator
        let mut frames = Vec::new();
        for i in 0..10 {
            frames.push(PhysFrame::containing_address(PhysAddr::new(i * 4096)));
        }
        let frame_allocator = Box::new(MockFrameAllocator { frames });

        // Create a memory manager with a small cache
        let mut manager = MemoryManager::new(
            unsafe { OffsetPageTable::new(PageTable::new(), VirtAddr::new(0)) },
            frame_allocator,
            2, // cache capacity
        );

        // Test page caching
        let data = Box::new([1, 2, 3, 4]);
        manager.cache_page(0x1000, 4, data);

        assert_eq!(manager.get_cached_page(0x1000, 4), Some(&[1, 2, 3, 4][..]));

        // Test cache eviction
        let data2 = Box::new([5, 6, 7, 8]);
        let data3 = Box::new([9, 10, 11, 12]);
        manager.cache_page(0x2000, 4, data2);
        manager.cache_page(0x3000, 4, data3);

        // The first page should be evicted
        assert_eq!(manager.get_cached_page(0x1000, 4), None);
        assert_eq!(manager.get_cached_page(0x2000, 4), Some(&[5, 6, 7, 8][..]));
        assert_eq!(manager.get_cached_page(0x3000, 4), Some(&[9, 10, 11, 12][..]));
    }
} 