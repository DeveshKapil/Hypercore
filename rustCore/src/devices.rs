// Example PCI device scanning (x86_64 only, requires port I/O support)
pub struct PciDevice {
    pub bus: u8,
    pub slot: u8,
    pub function: u8,
    pub vendor_id: u16,
    pub device_id: u16,
}

pub fn scan_pci_devices() -> Vec<PciDevice> {
    let mut devices = Vec::new();
    for bus in 0..=255 {
        for slot in 0..32 {
            for function in 0..8 {
                let vendor_id = pci_config_read_word(bus, slot, function, 0x00);
                if vendor_id == 0xFFFF { continue; }
                let device_id = pci_config_read_word(bus, slot, function, 0x02);
                devices.push(PciDevice { bus, slot, function, vendor_id, device_id });
            }
        }
    }
    devices
}

// Example: Read a word from PCI config space (requires x86 port I/O)
fn pci_config_read_word(bus: u8, slot: u8, function: u8, offset: u8) -> u16 {
    let address = (1 << 31)
        | ((bus as u32) << 16)
        | ((slot as u32) << 11)
        | ((function as u32) << 8)
        | ((offset as u32) & 0xfc);
    unsafe {
        x86::io::outl(0xCF8, address);
        ((x86::io::inl(0xCFC) >> ((offset & 2) * 8)) & 0xFFFF) as u16
    }
}
