pub struct WifiDevice {
    pub mac: [u8; 6],
    pub ssid: Option<&'static str>,
}

impl WifiDevice {
    pub fn new() -> Self {
        WifiDevice { mac: [0; 6], ssid: None }
    }

    pub fn connect(&mut self, ssid: &str, password: &str) -> Result<(), &'static str> {
        // Send connection request to hardware/firmware
        Err("Not implemented")
    }
}