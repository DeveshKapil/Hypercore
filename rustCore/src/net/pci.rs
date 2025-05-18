use super::{BluetoothDriver, BluetoothError};

pub struct PciBluetooth {
    mac: [u8; 6],
}

impl PciBluetooth {
    pub fn detect() -> Result<Self, BluetoothError> {
        // TODO: Scan PCI devices for Bluetooth controller
        Err(BluetoothError::DeviceNotFound)
    }
}

impl BluetoothDriver for PciBluetooth {
    fn get_mac(&self) -> [u8; 6] {
        self.mac
    }
    fn pair(&self, _device_addr: [u8; 6]) -> Result<(), BluetoothError> {
        Err(BluetoothError::NotImplemented)
    }
} 