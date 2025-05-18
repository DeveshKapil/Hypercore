use core::fmt;

pub struct FramebufferWriter {
    fb_addr: *mut u8,
    width: usize,
    height: usize,
    pitch: usize, // bytes per row
    bpp: usize,   // bytes per pixel
}

impl FramebufferWriter {
    pub fn new(fb_addr: *mut u8, width: usize, height: usize, pitch: usize, bpp: usize) -> Self {
        FramebufferWriter {
            fb_addr,
            width,
            height,
            pitch,
            bpp,
        }
    }

    /// Write a pixel at (x, y) with the given color (ARGB or RGB depending on bpp)
    pub fn write_pixel(&mut self, x: usize, y: usize, color: u32) {
        if x >= self.width || y >= self.height {
            return;
        }
        let offset = y * self.pitch + x * self.bpp;
        unsafe {
            let ptr = self.fb_addr.add(offset);
            match self.bpp {
                4 => *(ptr as *mut u32) = color, // 32bpp (ARGB/RGBA)
                3 => {
                    // 24bpp (RGB)
                    let bytes = color.to_le_bytes();
                    *ptr = bytes[0];
                    *ptr.add(1) = bytes[1];
                    *ptr.add(2) = bytes[2];
                }
                _ => {}
            }
        }
    }

    // Optionally, add more drawing routines here (rect, line, etc.)
}

// Print function for debug output (no text rendering, just a stub)
pub fn _print(_args: fmt::Arguments) {
    // No-op or implement pixel-based text rendering if needed
} 