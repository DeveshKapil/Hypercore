use core::fmt::{self, Write};

const FRAMEBUFFER: *mut u8 = 0xb8000 as *mut u8;

pub struct FramebufferWriter {
    col: usize,
    row: usize,
    width: usize,
    height: usize,
    pitch: usize, // bytes per row
    bpp: usize,   // bytes per pixel
}

impl FramebufferWriter {
    pub fn new(width: usize, height: usize, pitch: usize, bpp: usize, fb_addr: *mut u8) -> Self {
        FramebufferWriter {
            col: 0,
            row: 0,
            width,
            height,
            pitch,
            bpp,
            // Store fb_addr if you want to support multiple framebuffers
        }
    }

    pub fn write_pixel(&mut self, x: usize, y: usize, color: u32) {
        let offset = y * self.pitch + x * self.bpp;
        unsafe {
            let ptr = FRAMEBUFFER.add(offset);
            // For 32bpp (ARGB)
            *(ptr as *mut u32) = color;
        }
    }
}

impl Write for FramebufferWriter {
    fn write_str(&mut self, s: &str) -> fmt::Result {
        for byte in s.bytes() {
            unsafe {
                *FRAMEBUFFER.add(self.col * 2) = byte;
                *FRAMEBUFFER.add(self.col * 2 + 1) = 0x0f; // white on black
            }
            self.col += 1;
        }
        Ok(())
    }
}

pub fn _print(args: fmt::Arguments) {
    let mut writer = FramebufferWriter::new(0, 0, 0, 0, FRAMEBUFFER);
    let _ = writer.write_fmt(args);
} 