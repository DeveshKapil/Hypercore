use alloc::vec::Vec;
use alloc::string::String;
use alloc::boxed::Box;
use core::cell::RefCell;
use std::process::Command;

#[derive(Clone)]
struct VMSnapshot {
    name: String,
    // In a real system, this would include memory, disk, CPU state, etc.
    // For now, just a stub.
}

#[derive(Clone)]
struct VM {
    name: String,
    ram: usize,
    cpus: usize,
    disk_image: String, // Path to Ceph RBD image or other disk
    iso_path: Option<String>, // Optional path to Ubuntu ISO
    snapshots: Vec<VMSnapshot>,
}

struct VMManager {
    vms: RefCell<Vec<VM>>,
}

impl VMManager {
    const fn new() -> Self {
        VMManager { vms: RefCell::new(Vec::new()) }
    }

    fn list_vms(&self) {
        let vms = self.vms.borrow();
        if vms.is_empty() {
            println!("No VMs found.");
        } else {
            for vm in vms.iter() {
                println!("VM: {} (RAM: {}MB, CPUs: {})", vm.name, vm.ram, vm.cpus);
                if !vm.snapshots.is_empty() {
                    println!("  Snapshots: {}", vm.snapshots.iter().map(|s| s.name.as_str()).collect::<Vec<_>>().join(", "));
                }
            }
        }
    }

    fn create_vm(&self, name: &str, ram: usize, cpus: usize, disk_image: &str, iso_path: Option<&str>) {
        let mut vms = self.vms.borrow_mut();
        if vms.iter().any(|vm| vm.name == name) {
            println!("VM '{}' already exists.", name);
            return;
        }
        vms.push(VM {
            name: String::from(name),
            ram,
            cpus,
            disk_image: disk_image.to_string(),
            iso_path: iso_path.map(|s| s.to_string()),
            snapshots: Vec::new(),
        });
        println!("Created VM '{}'.", name);
        // TODO: Persist to storage
    }

    fn update_vm(&self, name: &str, ram: Option<usize>, cpus: Option<usize>) {
        let mut vms = self.vms.borrow_mut();
        if let Some(vm) = vms.iter_mut().find(|vm| vm.name == name) {
            if let Some(ram) = ram { vm.ram = ram; }
            if let Some(cpus) = cpus { vm.cpus = cpus; }
            println!("Updated VM '{}'.", name);
            // TODO: Persist to storage
        } else {
            println!("VM '{}' not found.", name);
        }
    }

    fn delete_vm(&self, name: &str) {
        let mut vms = self.vms.borrow_mut();
        let len_before = vms.len();
        vms.retain(|vm| vm.name != name);
        if vms.len() < len_before {
            println!("Deleted VM '{}'.", name);
            // TODO: Persist to storage
        } else {
            println!("VM '{}' not found.", name);
        }
    }

    fn snapshot_vm(&self, name: &str, snapshot: &str) {
        let mut vms = self.vms.borrow_mut();
        if let Some(vm) = vms.iter_mut().find(|vm| vm.name == name) {
            if vm.snapshots.iter().any(|s| s.name == snapshot) {
                println!("Snapshot '{}' already exists for VM '{}'.", snapshot, name);
                return;
            }
            vm.snapshots.push(VMSnapshot { name: String::from(snapshot) });
            println!("Snapshot '{}' created for VM '{}'.", snapshot, name);
            // TODO: Persist to storage
        } else {
            println!("VM '{}' not found.", name);
        }
    }

    fn restore_vm(&self, name: &str, snapshot: &str) {
        let vms = self.vms.borrow();
        if let Some(vm) = vms.iter().find(|vm| vm.name == name) {
            if vm.snapshots.iter().any(|s| s.name == snapshot) {
                println!("Restored VM '{}' from snapshot '{}'. (stub)", name, snapshot);
                // TODO: Restore VM state from snapshot (real implementation)
            } else {
                println!("Snapshot '{}' not found for VM '{}'.", snapshot, name);
            }
        } else {
            println!("VM '{}' not found.", name);
        }
    }

    // TODO: Implement persistence for VM state (save/load to storage)
    // fn save_to_storage(&self) { /* ... */ }
    // fn load_from_storage(&mut self) { /* ... */ }
    // Call these in create_vm, update_vm, delete_vm, etc.
}

thread_local! {
    static VM_MANAGER: VMManager = VMManager::new();
}

enum Command<'a> {
    ListVMs,
    CreateVM { name: &'a str, ram: usize, cpus: usize, disk_image: &'a str, iso_path: Option<&'a str> },
    UpdateVM { name: &'a str, ram: Option<usize>, cpus: Option<usize> },
    DeleteVM { name: &'a str },
    SnapshotVM { name: &'a str, snapshot: &'a str },
    RestoreVM { name: &'a str, snapshot: &'a str },
    BootVM { name: &'a str },
    StopVM { name: &'a str },
    ListSnapshots { name: &'a str },
    Help,
    Unknown,
}

fn parse_command(input: &str) -> Command {
    let tokens: Vec<&str> = input.trim().split_whitespace().collect();
    match tokens.as_slice() {
        ["list-vms"] => Command::ListVMs,
        ["create-vm", name, ram, cpus, disk_image] => {
            let ram = ram.parse().unwrap_or(0);
            let cpus = cpus.parse().unwrap_or(0);
            Command::CreateVM { name, ram, cpus, disk_image, iso_path: None }
        }
        ["create-vm", name, ram, cpus, disk_image, iso_path] => {
            let ram = ram.parse().unwrap_or(0);
            let cpus = cpus.parse().unwrap_or(0);
            Command::CreateVM { name, ram, cpus, disk_image, iso_path: Some(*iso_path) }
        }
        ["update-vm", name, rest @ ..] => {
            let mut ram = None;
            let mut cpus = None;
            let mut i = 0;
            while i < rest.len() {
                match rest[i] {
                    "--ram" if i + 1 < rest.len() => {
                        ram = rest[i + 1].parse().ok();
                        i += 2;
                    }
                    "--cpus" if i + 1 < rest.len() => {
                        cpus = rest[i + 1].parse().ok();
                        i += 2;
                    }
                    _ => { i += 1; }
                }
            }
            Command::UpdateVM { name, ram, cpus }
        }
        ["delete-vm", name] => Command::DeleteVM { name },
        ["snapshot-vm", name, snapshot] => Command::SnapshotVM { name, snapshot },
        ["restore-vm", name, snapshot] => Command::RestoreVM { name, snapshot },
        ["boot-vm", name] => Command::BootVM { name },
        ["stop-vm", name] => Command::StopVM { name },
        ["list-snapshots", name] => Command::ListSnapshots { name },
        ["help"] => Command::Help,
        _ => Command::Unknown,
    }
}

fn list_vms() {
    VM_MANAGER.with(|mgr| mgr.list_vms());
}

fn create_vm(name: &str, ram: usize, cpus: usize, disk_image: &str, iso_path: Option<&str>) {
    VM_MANAGER.with(|mgr| mgr.create_vm(name, ram, cpus, disk_image, iso_path));
}

fn update_vm(name: &str, ram: Option<usize>, cpus: Option<usize>) {
    VM_MANAGER.with(|mgr| mgr.update_vm(name, ram, cpus));
}

fn delete_vm(name: &str) {
    VM_MANAGER.with(|mgr| mgr.delete_vm(name));
}

fn snapshot_vm(name: &str, snapshot: &str) {
    VM_MANAGER.with(|mgr| mgr.snapshot_vm(name, snapshot));
}

fn restore_vm(name: &str, snapshot: &str) {
    VM_MANAGER.with(|mgr| mgr.restore_vm(name, snapshot));
}

fn boot_vm(name: &str) {
    VM_MANAGER.with(|mgr| {
        let vms = mgr.vms.borrow();
        if let Some(vm) = vms.iter().find(|vm| vm.name == name) {
            let mut cmd = Command::new("qemu-system-x86_64");
            cmd.arg("-enable-kvm")
                .arg("-m").arg(vm.ram.to_string())
                .arg("-smp").arg(vm.cpus.to_string())
                .arg("-drive").arg(format!("file={},if=virtio,format=raw", vm.disk_image));
            if let Some(iso) = &vm.iso_path {
                cmd.arg("-cdrom").arg(iso)
                    .arg("-boot").arg("d");
            }
            println!("Launching QEMU for VM '{}'...", name);
            match cmd.spawn() {
                Ok(_child) => println!("VM '{}' started.", name),
                Err(e) => println!("Failed to start VM '{}': {}", name, e),
            }
        } else {
            println!("VM '{}' not found.", name);
        }
    });
}

fn stop_vm(name: &str) {
    // TODO: Implement real VM stop logic
    println!("Stopping VM '{}' (stub)", name);
}

fn list_snapshots(name: &str) {
    VM_MANAGER.with(|mgr| {
        let vms = mgr.vms.borrow();
        if let Some(vm) = vms.iter().find(|vm| vm.name == name) {
            if vm.snapshots.is_empty() {
                println!("No snapshots for VM '{}'.", name);
            } else {
                println!("Snapshots for VM '{}': {}", name, vm.snapshots.iter().map(|s| s.name.as_str()).collect::<Vec<_>>().join(", "));
            }
        } else {
            println!("VM '{}' not found.", name);
        }
    });
}

fn print_help() {
    println!("Available commands:");
    println!("  list-vms");
    println!("  create-vm <name> <ram_mb> <cpus> <disk_image> [iso_path]");
    println!("  update-vm <name> [--ram <ram_mb>] [--cpus <cpus>]");
    println!("  delete-vm <name>");
    println!("  snapshot-vm <name> <snapshot>");
    println!("  restore-vm <name> <snapshot>");
    println!("  boot-vm <name>");
    println!("  stop-vm <name>");
    println!("  list-snapshots <name>");
    println!("  help");
}

// TODO: Implement reading from serial/framebuffer for real shell input
fn read_line() -> String {
    // For now, this is a stub. Replace with real input handling.
    String::new()
}

pub fn shell_main() {
    loop {
        let line = read_line();
        match parse_command(&line) {
            Command::ListVMs => list_vms(),
            Command::CreateVM { name, ram, cpus, disk_image, iso_path } => create_vm(name, ram, cpus, disk_image, iso_path),
            Command::UpdateVM { name, ram, cpus } => update_vm(name, ram, cpus),
            Command::DeleteVM { name } => delete_vm(name),
            Command::SnapshotVM { name, snapshot } => snapshot_vm(name, snapshot),
            Command::RestoreVM { name, snapshot } => restore_vm(name, snapshot),
            Command::BootVM { name } => boot_vm(name),
            Command::StopVM { name } => stop_vm(name),
            Command::ListSnapshots { name } => list_snapshots(name),
            Command::Help => print_help(),
            Command::Unknown => println!("Unknown command"),
        }
    }
}
