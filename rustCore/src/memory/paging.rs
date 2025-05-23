use x86_64::structures::paging::{Page, PageTableFlags, Mapper, Size4KiB};
use x86_64::VirtAddr;
use crate::memory::manager::{MemoryManager, PAGE_SIZE};
use crate::storage::StorageBackend;

const PAGE_SIZE_U64: u64 = PAGE_SIZE as u64;

fn hash_page_addr(addr: u64, num_blocks: u64) -> u64 {
    let page_num = addr / PAGE_SIZE_U64;
    page_num.wrapping_mul(2654435761) % num_blocks
}

// Helper: Write cached data to the newly mapped page
fn restore_page_data(addr: u64, data: &[u8]) {
    let ptr = addr as *mut u8;
    unsafe {
        core::ptr::copy_nonoverlapping(data.as_ptr(), ptr, data.len());
    }
}

// Handle a page fault with LRU integration
pub fn handle_page_fault(addr: u64, memory_manager: &mut MemoryManager<impl Mapper<Size4KiB>, impl StorageBackend>, storage_backend: &impl StorageBackend) {
    let page = Page::containing_address(VirtAddr::new(addr));
    let flags = if addr < 0x8000_0000_0000 {
        PageTableFlags::PRESENT | PageTableFlags::WRITABLE | PageTableFlags::USER_ACCESSIBLE
    } else {
        PageTableFlags::PRESENT | PageTableFlags::WRITABLE
    };
    if let Some(cached_data) = memory_manager.get_cached_page(addr, PAGE_SIZE) {
        match memory_manager.map_page(page, flags) {
            Ok(_flush) => {
                restore_page_data(addr, cached_data);
                crate::println!("Page fault handled: restored cached page at {:#x}", addr);
            }
            Err(e) => {
                crate::println!("Page fault: failed to map cached page at {:#x}: {:?}", addr, e);
                panic!("Unable to handle page fault at {:#x}", addr);
            }
        }
    } else {
        let mut page_buf = [0u8; PAGE_SIZE];
        let num_blocks = storage_backend.num_blocks();
        let fault_block_id = hash_page_addr(addr, num_blocks);
        storage_backend.read_block(fault_block_id, &mut page_buf).ok();
        match memory_manager.map_page(page, flags) {
            Ok(_flush) => {
                restore_page_data(addr, &page_buf);
                crate::println!("Page fault handled: mapped new blank page at {:#x}", addr);
            }
            Err(e) => {
                crate::println!("Page fault: failed to map page at {:#x}: {:?}", addr, e);
                panic!("Unable to handle page fault at {:#x}", addr);
            }
        }
    }
}
