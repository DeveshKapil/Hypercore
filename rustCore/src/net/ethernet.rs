mod pci;
mod usb;

pub enum EthernetError {
    NotImplemented,
    DeviceNotFound,
    CommunicationError,
    LinkDown,
}

pub trait EthernetDriver {
    fn get_mac(&self) -> [u8; 6];
    fn send(&self, data: &[u8]) -> Result<(), EthernetError>;
    fn receive(&self, buffer: &mut [u8]) -> Result<usize, EthernetError>;
    // Add more trait methods as needed
}

pub enum EthernetBackend {
    Pci(pci::PciEthernet),
    Usb(usb::UsbEthernet),
}

pub struct EthernetDevice {
    pub mac: [u8; 6],
    backend: EthernetBackend,
}

impl EthernetDevice {
    pub fn detect() -> Result<Self, EthernetError> {
        // Try PCI first
        if let Ok(pci) = pci::PciEthernet::detect() {
            let mac = pci.get_mac();
            return Ok(EthernetDevice { mac, backend: EthernetBackend::Pci(pci) });
        }
        // Try USB next
        if let Ok(usb) = usb::UsbEthernet::detect() {
            let mac = usb.get_mac();
            return Ok(EthernetDevice { mac, backend: EthernetBackend::Usb(usb) });
        }
        Err(EthernetError::DeviceNotFound)
    }

    pub fn send(&self, data: &[u8]) -> Result<(), EthernetError> {
        match &self.backend {
            EthernetBackend::Pci(pci) => pci.send(data),
            EthernetBackend::Usb(usb) => usb.send(data),
        }
    }

    pub fn receive(&self, buffer: &mut [u8]) -> Result<usize, EthernetError> {
        match &self.backend {
            EthernetBackend::Pci(pci) => pci.receive(buffer),
            EthernetBackend::Usb(usb) => usb.receive(buffer),
        }
    }
    // Add more methods as needed, dispatching to the backend
}
