mod pci;
mod usb;

pub enum WifiError {
    NotImplemented,
    DeviceNotFound,
    CommunicationError,
    ConnectionFailed,
}

pub trait WifiDriver {
    fn get_mac(&self) -> [u8; 6];
    fn scan(&self) -> Result<Vec<String>, WifiError>;
    fn connect(&mut self, ssid: &str, password: &str) -> Result<(), WifiError>;
    fn disconnect(&mut self) -> Result<(), WifiError>;
    // Add more trait methods as needed
}

pub enum WifiBackend {
    Pci(pci::PciWifi),
    Usb(usb::UsbWifi),
}

pub struct WifiDevice {
    pub mac: [u8; 6],
    backend: WifiBackend,
}

impl WifiDevice {
    pub fn detect() -> Result<Self, WifiError> {
        // Try PCI first
        if let Ok(pci) = pci::PciWifi::detect() {
            let mac = pci.get_mac();
            return Ok(WifiDevice { mac, backend: WifiBackend::Pci(pci) });
        }
        // Try USB next
        if let Ok(usb) = usb::UsbWifi::detect() {
            let mac = usb.get_mac();
            return Ok(WifiDevice { mac, backend: WifiBackend::Usb(usb) });
        }
        Err(WifiError::DeviceNotFound)
    }

    pub fn connect(&mut self, ssid: &str, password: &str) -> Result<(), WifiError> {
        match &mut self.backend {
            WifiBackend::Pci(pci) => pci.connect(ssid, password),
            WifiBackend::Usb(usb) => usb.connect(ssid, password),
        }
    }

    pub fn disconnect(&mut self) -> Result<(), WifiError> {
        match &mut self.backend {
            WifiBackend::Pci(pci) => pci.disconnect(),
            WifiBackend::Usb(usb) => usb.disconnect(),
        }
    }

    pub fn scan(&self) -> Result<Vec<String>, WifiError> {
        match &self.backend {
            WifiBackend::Pci(pci) => pci.scan(),
            WifiBackend::Usb(usb) => usb.scan(),
        }
    }
    // Add more methods as needed, dispatching to the backend
}