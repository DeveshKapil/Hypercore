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
    fn scan(&self) -> Result<Vec<[u8; 6]>, BluetoothError> {
        // Mock: Return a list of fake device MACs
        Ok(vec![[0xAA,0xBB,0xCC,0xDD,0xEE,0xFF]])
    }
    fn pair(&self, _device_addr: [u8; 6]) -> Result<(), BluetoothError> {
        Ok(())
    }
    fn disconnect(&self, _device_addr: [u8; 6]) -> Result<(), BluetoothError> {
        Ok(())
    }
} 