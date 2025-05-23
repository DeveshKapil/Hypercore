pub struct RamDisk {
    storage: &'static mut [u8],
    sector_size: usize,
}

impl RamDisk {
    pub fn new(storage: &'static mut [u8], sector_size: usize) -> Self {
        Self { storage, sector_size }
    }
}

impl BlockDevice for RamDisk {
    fn read_sector(&self, lba: u64, buf: &mut [u8]) -> Result<(), ()> {
        let offset = (lba as usize) * self.sector_size;
        buf.copy_from_slice(&self.storage[offset..offset + self.sector_size]);
        Ok(())
    }
    fn write_sector(&self, lba: u64, buf: &[u8]) -> Result<(), ()> {
        let offset = (lba as usize) * self.sector_size;
        self.storage[offset..offset + self.sector_size].copy_from_slice(buf);
        Ok(())
    }
    fn capacity(&self) -> usize {
        self.storage.len()
    }
}
