pub trait BlockDevice {
    fn read_sector(&self, lba: u64, buf: &mut [u8]) -> Result<(), ()>;
    fn write_sector(&self, lba: u64, buf: &[u8]) -> Result<(), ()>;
    fn capacity(&self) -> usize;
}
