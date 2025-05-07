use core::fmt;
use x86_64::instructions::port::Port;

// Graphics mode constants
pub const WIDTH: usize = 1920;
pub const HEIGHT: usize = 1080;
pub const BPP: usize = 32; // Bits per pixel

// Color structure for 32-bit color
#[derive(Debug, Clone, Copy)]
#[repr(C)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
}

impl Color {
    pub const BLACK: Color = Color { r: 0, g: 0, b: 0, a: 255 };
    pub const WHITE: Color = Color { r: 255, g: 255, b: 255, a: 255 };
    pub const RED: Color = Color { r: 255, g: 0, b: 0, a: 255 };
    pub const GREEN: Color = Color { r: 0, g: 255, b: 0, a: 255 };
    pub const BLUE: Color = Color { r: 0, g: 0, b: 255, a: 255 };
}

pub struct FrameBuffer {
    buffer: &'static mut [u32],
    width: usize,
    height: usize,
}

impl FrameBuffer {
    pub fn new(buffer: &'static mut [u32], width: usize, height: usize) -> Self {
        FrameBuffer {
            buffer,
            width,
            height,
        }
    }

    pub fn clear(&mut self, color: Color) {
        let color_value = ((color.a as u32) << 24) |
                         ((color.r as u32) << 16) |
                         ((color.g as u32) << 8) |
                         (color.b as u32);
        
        for pixel in self.buffer.iter_mut() {
            *pixel = color_value;
        }
    }

    pub fn draw_pixel(&mut self, x: usize, y: usize, color: Color) {
        if x < self.width && y < self.height {
            let color_value = ((color.a as u32) << 24) |
                             ((color.r as u32) << 16) |
                             ((color.g as u32) << 8) |
                             (color.b as u32);
            self.buffer[y * self.width + x] = color_value;
        }
    }

    pub fn draw_rect(&mut self, x: usize, y: usize, width: usize, height: usize, color: Color) {
        for dy in 0..height {
            for dx in 0..width {
                self.draw_pixel(x + dx, y + dy, color);
            }
        }
    }
}

// UEFI Graphics Output Protocol interface
pub struct GraphicsOutput {
    mode: u32,
    framebuffer: FrameBuffer,
}

impl GraphicsOutput {
    pub fn new(framebuffer_addr: usize, width: usize, height: usize) -> Self {
        let buffer = unsafe {
            core::slice::from_raw_parts_mut(
                framebuffer_addr as *mut u32,
                width * height
            )
        };
        
        GraphicsOutput {
            mode: 0,
            framebuffer: FrameBuffer::new(buffer, width, height),
        }
    }

    pub fn clear_screen(&mut self, color: Color) {
        self.framebuffer.clear(color);
    }

    pub fn draw_rect(&mut self, x: usize, y: usize, width: usize, height: usize, color: Color) {
        self.framebuffer.draw_rect(x, y, width, height, color);
    }
}

// Initialize graphics mode
pub fn init_graphics() -> Option<GraphicsOutput> {
    // This is a placeholder. In a real implementation, you would:
    // 1. Use UEFI's Graphics Output Protocol to set up the display
    // 2. Get the framebuffer address and mode information
    // 3. Initialize the GraphicsOutput struct with the correct parameters
    
    // For now, we'll return None to indicate that graphics initialization
    // needs to be implemented
    None
} 