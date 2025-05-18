use super::{BluetoothDriver, BluetoothError};

pub struct UsbBluetooth {
    mac: [u8; 6],
}

impl UsbBluetooth {
    pub fn detect() -> Result<Self, BluetoothError> {
        // TODO: Scan USB devices for Bluetooth controller
        Err(BluetoothError::DeviceNotFound)
    }
}

impl BluetoothDriver for UsbBluetooth {
    fn get_mac(&self) -> [u8; 6] {
        self.mac
    }
    fn pair(&self, _device_addr: [u8; 6]) -> Result<(), BluetoothError> {
        Err(BluetoothError::NotImplemented)
    }
} 