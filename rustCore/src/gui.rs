use crate::graphics::FramebufferWriter;
use crate::shell::{list_vms, create_vm, boot_vm, stop_vm, delete_vm, snapshot_vm, restore_vm, list_snapshots, print_help};

pub struct Gui<'a> {
    fb: &'a mut FramebufferWriter,
}

impl<'a> Gui<'a> {
    pub fn new(fb: &'a mut FramebufferWriter) -> Self {
        Gui { fb }
    }

    pub fn draw_menu(&mut self) {
        let fg = 0xFFFFFFFF; // white
        let bg = 0x00000000; // black
        self.fb.draw_string(10, 10, "Hypercore VM Manager", fg, bg);
        self.fb.draw_string(10, 30, "1. List VMs", fg, bg);
        self.fb.draw_string(10, 50, "2. Create VM", fg, bg);
        self.fb.draw_string(10, 70, "3. Boot VM", fg, bg);
        self.fb.draw_string(10, 90, "4. Stop VM", fg, bg);
        self.fb.draw_string(10, 110, "5. Delete VM", fg, bg);
        self.fb.draw_string(10, 130, "6. Snapshot VM", fg, bg);
        self.fb.draw_string(10, 150, "7. Restore VM", fg, bg);
        self.fb.draw_string(10, 170, "8. List Snapshots", fg, bg);
        self.fb.draw_string(10, 190, "9. Help", fg, bg);
        self.fb.draw_string(10, 210, "0. Exit", fg, bg);
    }

    pub fn handle_input(&mut self, input: u8) {
        // For now, just call the functions directly as a stub
        match input {
            b'1' => list_vms(),
            b'2' => create_vm("demo", 128, 1), // TODO: prompt for real input
            b'3' => boot_vm("demo"),
            b'4' => stop_vm("demo"),
            b'5' => delete_vm("demo"),
            b'6' => snapshot_vm("demo", "snap1"),
            b'7' => restore_vm("demo", "snap1"),
            b'8' => list_snapshots("demo"),
            b'9' => print_help(),
            b'0' => {/* exit GUI loop */},
            _ => {},
        }
    }
} 