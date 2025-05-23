pub mod block_devices;
pub mod ramdisk;

pub use block_devices::BlockDevice;
pub use ramdisk::RamDisk;

pub trait StorageBackend {
    fn read_block(&self, block_id: u64, buf: &mut [u8]) -> Result<(), ()>;
    fn write_block(&self, block_id: u64, buf: &[u8]) -> Result<(), ()>;
}

pub struct BlockStorage<B: BlockDevice> {
    device: B,
    block_size: usize,
}

impl<B: BlockDevice> BlockStorage<B> {
    pub fn new(device: B, block_size: usize) -> Self {
        Self { device, block_size }
    }
}

impl<B: BlockDevice> StorageBackend for BlockStorage<B> {
    fn read_block(&self, block_id: u64, buf: &mut [u8]) -> Result<(), ()> {
        // For simplicity, 1 block = 1 sector
        self.device.read_sector(block_id, buf)
    }
    fn write_block(&self, block_id: u64, buf: &[u8]) -> Result<(), ()> {
        self.device.write_sector(block_id, buf)
    }
}
