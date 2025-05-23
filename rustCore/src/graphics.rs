use core::fmt;

pub struct FramebufferWriter {
    fb_addr: *mut u8,
    width: usize,
    height: usize,
    pitch: usize, // bytes per row
    bpp: usize,   // bytes per pixel
}

// 8x8 ASCII font (partial, for demo; fill out as needed)
const FONT8X8: [[u8; 8]; 128] = [
    // Only a few characters for brevity; fill out for full ASCII
    [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00], // 0x00 (null)
    [0x3C,0x66,0x6E,0x76,0x66,0x66,0x3C,0x00], // 0x01 (smiley)
    // ...
    [0x00; 8]; 126 // Fill out the rest as needed
];

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

    /// Draw an ASCII character at (x, y) in pixels, with foreground and background color
    pub fn draw_char(&mut self, x: usize, y: usize, c: char, fg: u32, bg: u32) {
        let idx = c as usize;
        if idx >= 128 { return; }
        let bitmap = &FONT8X8[idx];
        for (row, bits) in bitmap.iter().enumerate() {
            for col in 0..8 {
                let color = if (bits >> (7 - col)) & 1 == 1 { fg } else { bg };
                self.write_pixel(x + col, y + row, color);
            }
        }
    }

    /// Draw a string at (x, y) in pixels, with foreground and background color
    pub fn draw_string(&mut self, x: usize, y: usize, s: &str, fg: u32, bg: u32) {
        for (i, c) in s.chars().enumerate() {
            self.draw_char(x + i * 8, y, c, fg, bg);
        }
    }

    // Optionally, add more drawing routines here (rect, line, etc.)
}

// Print function for debug output (no text rendering, just a stub)
pub fn _print(_args: fmt::Arguments) {
    // No-op or implement pixel-based text rendering if needed
} 