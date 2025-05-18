mod usb;
mod pci;
mod uart;

pub enum BluetoothError {
    NotImplemented,
    DeviceNotFound,
    CommunicationError,
    PairingFailed,
}

pub trait BluetoothDriver {
    fn get_mac(&self) -> [u8; 6];
    fn pair(&self, device_addr: [u8; 6]) -> Result<(), BluetoothError>;
    // Add more trait methods as needed
}

pub enum BluetoothBackend {
    Usb(usb::UsbBluetooth),
    Pci(pci::PciBluetooth),
    Uart(uart::UartBluetooth),
}

pub struct BluetoothDevice {
    pub mac: [u8; 6],
    backend: BluetoothBackend,
}

impl BluetoothDevice {
    pub fn detect() -> Result<Self, BluetoothError> {
        // Try USB first
        if let Ok(usb) = usb::UsbBluetooth::detect() {
            let mac = usb.get_mac();
            return Ok(BluetoothDevice { mac, backend: BluetoothBackend::Usb(usb) });
        }
        // Try PCI next
        if let Ok(pci) = pci::PciBluetooth::detect() {
            let mac = pci.get_mac();
            return Ok(BluetoothDevice { mac, backend: BluetoothBackend::Pci(pci) });
        }
        // Try UART last
        if let Ok(uart) = uart::UartBluetooth::detect() {
            let mac = uart.get_mac();
            return Ok(BluetoothDevice { mac, backend: BluetoothBackend::Uart(uart) });
        }
        Err(BluetoothError::DeviceNotFound)
    }

    pub fn pair(&self, device_addr: [u8; 6]) -> Result<(), BluetoothError> {
        match &self.backend {
            BluetoothBackend::Usb(usb) => usb.pair(device_addr),
            BluetoothBackend::Pci(pci) => pci.pair(device_addr),
            BluetoothBackend::Uart(uart) => uart.pair(device_addr),
        }
    }
    // Add more methods as needed, dispatching to the backend
}