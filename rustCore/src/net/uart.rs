use super::{BluetoothDriver, BluetoothError};

pub struct UartBluetooth {
    mac: [u8; 6],
}

impl UartBluetooth {
    pub fn detect() -> Result<Self, BluetoothError> {
        // TODO: Scan UART ports for Bluetooth controller
        Err(BluetoothError::DeviceNotFound)
    }
}

impl BluetoothDriver for UartBluetooth {
    fn get_mac(&self) -> [u8; 6] {
        self.mac
    }
    fn pair(&self, _device_addr: [u8; 6]) -> Result<(), BluetoothError> {
        Err(BluetoothError::NotImplemented)
    }
} 