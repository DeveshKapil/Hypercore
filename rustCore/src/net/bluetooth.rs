pub struct BluetoothDevice {
    pub mac: [u8; 6],
}

impl BluetoothDevice {
    pub fn new() -> Self {
        BluetoothDevice { mac: [0; 6] }
    }

    pub fn pair(&self, device_addr: [u8; 6]) -> Result<(), &'static str> {
        // Send pairing request
        Err("Not implemented")
    }
}