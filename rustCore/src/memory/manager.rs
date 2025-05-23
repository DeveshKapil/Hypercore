use x86_64::structures::paging::{Page, PageTableFlags, Mapper, Size4KiB, FrameAllocator, PhysFrame};
use x86_64::structures::paging::mapper::{MapperFlush, MapToError, UnmapError};
use super::SimpleFrameAllocator;
use super::lru::{LRUCache, PageKey};
use alloc::boxed::Box;
use x86_64::VirtAddr;
use alloc::vec;
use alloc::vec::Vec;
use alloc::string::String;
use alloc::string::ToString;

use crate::STORAGE;
use crate::storage::{StorageBackend, BlockStorage, RamDisk};


pub const PAGE_SIZE: usize = 4096;

pub struct MemoryManager<'a, M: Mapper<Size4KiB>, S: StorageBackend> {
    pub mapper: &'a mut M,
    pub frame_allocator: &'a mut SimpleFrameAllocator,
    pub lru: LRUCache,
    pub storage_backend: &'a S,
}

impl<'a, M: Mapper<Size4KiB>, S: StorageBackend> MemoryManager<'a, M, S> {
    pub fn map_page(&mut self, page: Page, flags: PageTableFlags) -> Result<MapperFlush<Size4KiB>, MapToError<Size4KiB>> {
        if let Some(frame) = self.frame_allocator.allocate_frame() {
            // SAFETY: caller must ensure the page is unused
            unsafe { self.mapper.map_to(page, frame, flags, self.frame_allocator) }
        } else {
            // Evict LRU page if out of frames
            if let Some((evict_addr, evict_size)) = self.lru.order.front().map(|k| (k.address, k.size)) {
                self.evict_and_deallocate(evict_addr, evict_size).ok();
                // Try again after eviction
                if let Some(frame) = self.frame_allocator.allocate_frame() {
                    unsafe { self.mapper.map_to(page, frame, flags, self.frame_allocator) }
                } else {
                    Err(MapToError::FrameAllocationFailed)
                }
            } else {
                Err(MapToError::FrameAllocationFailed)
            }
        }
    }

    pub fn evict_and_deallocate(&mut self, address: u64, size: usize) -> Result<(), UnmapError> {
        let key = PageKey { address, size };
        let page = Page::containing_address(VirtAddr::new(address));
        // Read page data before unmapping
        let data = unsafe {
            let ptr = address as *const u8;
            let mut buf = vec![0u8; size];
            core::ptr::copy_nonoverlapping(ptr, buf.as_mut_ptr(), size);
            buf.into_boxed_slice()
        };
        self.cache_page(address, size, data);
        if self.lru.remove(&key).is_some() {
            let _flush = self.unmap_page(page)?;
            Ok(())
        } else {
            Err(UnmapError::PageNotMapped)
        }
    }

    pub fn unmap_page(&mut self, page: Page) -> Result<(PhysFrame<Size4KiB>, MapperFlush<Size4KiB>), UnmapError> {
        // SAFETY: caller must ensure the page is mapped
        let (frame, flush) = { self.mapper.unmap(page)? };
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