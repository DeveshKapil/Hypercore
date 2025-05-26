# **Hypercore - Baremetal Hypervisor**

## **Overview**
Hypercore is an innovative bare-metal hypervisor designed to facilitate seamless data sharing across virtual machines. Unlike traditional hypervisors, Hypercore introduces a **common storage space**, enabling users to copy, paste, and transfer files between VMs using **Ctrl+C, Ctrl+V, and drag-and-drop**, enhancing virtualization efficiency.

## **Baremetal Environment Preparation**

### **Step 1: Install a Virtual Machine Manager**
To set up a virtualized environment for Hypercore development, install any **Virtual Machine Manager**. In this project, we are using **VirtualBox**.

- Download and install **VirtualBox** from: [https://www.virtualbox.org/](https://www.virtualbox.org/)
- Ensure VirtualBox Extension Pack is installed for additional functionalities.

### **Step 2: Download and Set Up Ubuntu 22.04 LTS**
- Download the **Ubuntu 22.04 LTS VirtualBox Image** from: [Ubuntu Official Site](https://ubuntu.com/download)
- Create a new virtual machine in VirtualBox and allocate at least:
  - **2+ CPU cores**
  - **4GB+ RAM (Recommended: 8GB+)**
  - **20GB+ Storage**
- Boot the VM and complete the installation process.

### **Step 3: Install Git**
Once Ubuntu is set up, install Git by running:
```bash
sudo apt update && sudo apt install -y git
```

### **Step 4: Clone the Hypercore Repository**
To get the latest Hypercore source code, clone the repository:
```bash
git clone https://www.github.com/DeveshKapil/Hypercore.git
```
Navigate to the project directory:
```bash
cd Hypercore
```

### **Step 5: Install Required Dependencies**
Run the setup script to install all required programs and dependencies:
```bash
sudo ./data/req.sh
```
- Ensure the script has execute permissions. If not, run:
  ```bash
  sudo chmod +x ./data/req.sh
  ```  
- This script will install all necessary dependencies for running Hypercore.

### **Step 6: Verify Installation**
Check if all required packages are installed correctly by running:
```bash
./data/check_env.sh
```
(If a script like `check_env.sh` does not exist, consider adding one to validate system readiness.)

---

## **QEMU and Ceph Installation**

### **Install QEMU and Ceph**
Run the following commands to install QEMU (with KVM support) and Ceph:

```bash
sudo apt-get update
sudo apt-get install -y ceph qemu qemu-kvm
```

---

## **Ceph Cluster Configuration (Single Node for Development)**

### **1. Prepare ceph.conf**
Generate a UUID for your cluster:
```bash
uuidgen
```
Edit (or create) `ceph.conf` in your project root and set the `fsid` to the UUID you generated:

```ini
[global]
fsid = <your-uuid-here>
mon_initial_members = a
mon_host = 127.0.0.1
auth_cluster_required = none
auth_service_required = none
auth_client_required = none
osd_journal_size = 100
osd_pool_default_size = 1
osd_pool_default_min_size = 1
osd_pool_default_pg_num = 8
osd_pool_default_pgp_num = 8
```

### **2. Prepare Directories**
```bash
sudo mkdir -p /var/lib/ceph/mon/ceph-a
sudo mkdir -p /var/lib/ceph/osd/ceph-0
```

### **3. Create Keyrings and Monmap**
```bash
sudo ceph-authtool --create-keyring /tmp/ceph.mon.keyring --gen-key -n mon. --cap mon 'allow *'
sudo ceph-authtool --create-keyring /tmp/ceph.client.admin.keyring --gen-key -n client.admin --cap mon 'allow *' --cap osd 'allow *' --cap mgr 'allow *'
sudo monmaptool --create --add a 127.0.0.1 --fsid <your-uuid-here> /tmp/monmap
```

### **4. Initialize and Start the Monitor**
```bash
sudo ceph-mon --mkfs -i a --monmap /tmp/monmap --keyring /tmp/ceph.mon.keyring --conf /home/dev/Hypercore-1/ceph.conf
sudo ceph-mon -i a --conf /home/dev/Hypercore-1/ceph.conf
```

### **5. Initialize and Start the OSD**
```bash
sudo ceph-osd -i 0 --mkfs --osd-data /var/lib/ceph/osd/ceph-0 --conf /home/dev/Hypercore-1/ceph.conf --keyring /tmp/ceph.client.admin.keyring
sudo ceph-osd -i 0 --osd-data /var/lib/ceph/osd/ceph-0 --conf /home/dev/Hypercore-1/ceph.conf
```

### **6. Check Cluster Health**
```bash
ceph -c /home/dev/Hypercore-1/ceph.conf health
```

### **7. Create a Pool and RBD Image**
```bash
ceph -c /home/dev/Hypercore-1/ceph.conf osd pool create vm-pool 8
rbd -c /home/dev/Hypercore-1/ceph.conf create vm-pool/ubuntu-vm --size 10240
```

---

## **Running the Hypervisor**

### **1. Create a VM**
Use the CLI to create a VM, specifying the Ceph RBD image and (optionally) an Ubuntu ISO:

```bash
create-vm <name> <ram_mb> <cpus> rbd:vm-pool/ubuntu-vm:conf=/home/dev/Hypercore-1/ceph.conf /path/to/ubuntu.iso
```

Example:
```bash
create-vm ubuntu-vm 2048 2 rbd:vm-pool/ubuntu-vm:conf=/home/dev/Hypercore-1/ceph.conf /home/dev/Hypercore-1/ubuntu-22.04.iso
```

### **2. Boot the VM**
```bash
boot-vm ubuntu-vm
```

This will launch QEMU with the specified Ceph RBD image as the VM's disk.

---

**Note:**
- Make sure your Ceph monitor and OSD are running before starting a VM.
- For production or multi-node clusters, refer to the official Ceph documentation.

# Hypercore-GUI

A modern, electron-based graphical user interface for managing QEMU/KVM virtual machines with advanced features like shared storage, snapshots, and SPICE display integration.

## Features

- Create and manage QEMU/KVM virtual machines
- SPICE display integration for VM interaction
- Shared folder support between host and VMs
- VM snapshots and cloning
- Resource monitoring (CPU, Memory, Disk usage)
- Guest agent integration for enhanced VM management
- Support for multiple VM configurations

## Requirements

### System Requirements
- Linux-based operating system (Ubuntu/Debian recommended)
- KVM-capable CPU with virtualization enabled
- At least 4GB RAM (8GB recommended)
- Sufficient disk space for VM storage

### Software Dependencies
```bash
# Install required packages
sudo apt-get update
sudo apt-get install -y \
    qemu-kvm \
    qemu-system-x86 \
    qemu-utils \
    libvirt-daemon \
    libvirt-clients \
    bridge-utils \
    virt-manager \
    spice-client-gtk \
    socat
```

### User Setup
```bash
# Add user to required groups
sudo usermod -aG kvm,libvirt $USER

# Create required directories
mkdir -p ~/.hypercore/vms
mkdir -p ~/.hypercore/shared_folder
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/hypercore-gui.git
cd hypercore-gui
```

2. Install dependencies:
```bash
npm install
```

3. Build the application:
```bash
npm run build
```

4. Start the application:
```bash
npm start
```

## Usage

### Creating a New VM

1. Click "Create VM" in the GUI
2. Specify:
   - VM Name
   - RAM allocation
   - Number of CPU cores
   - Storage size
   - Optional: ISO file for OS installation

### Managing VMs

#### Starting a VM
- Select the VM from the list
- Click "Start"
- The SPICE viewer will launch automatically

#### Stopping a VM
- Select the VM
- Click "Stop" for graceful shutdown
- Use "Force Stop" only if necessary

### Shared Folder Usage

1. Host Setup:
```bash
# Files placed here will be accessible in the VM
~/.hypercore/shared_folder/
```

2. VM Setup:
```bash
# Mount the shared folder in the VM
sudo mount -t 9p -o trans=virtio,version=9p2000.L hypercore_share /shared
```

3. Verify mounting:
```bash
# Check if mounted correctly
df -h /shared
ls -la /shared
```

### Snapshots

1. Creating a snapshot:
   - Select VM
   - Click "Create Snapshot"
   - Enter snapshot name

2. Restoring a snapshot:
   - Select VM
   - Go to "Snapshots" tab
   - Select snapshot
   - Click "Restore"

### Common Issues and Solutions

1. SPICE viewer not launching:
```bash
# Install virt-viewer package
sudo apt-get install virt-viewer
```

2. Permission denied errors:
```bash
# Fix permissions for VM directories
sudo chown -R $USER:$USER ~/.hypercore
```

3. KVM not available:
```bash
# Check KVM module
lsmod | grep kvm
# Load KVM module if needed
sudo modprobe kvm
```

4. Shared folder not working:
```bash
# Load required kernel modules
sudo modprobe 9p
sudo modprobe 9pnet
sudo modprobe 9pnet_virtio
```

### Advanced Features

#### Guest Agent Setup

1. In the VM:
```bash
# Install QEMU guest agent
sudo apt-get install qemu-guest-agent
sudo systemctl enable qemu-guest-agent
sudo systemctl start qemu-guest-agent
```

#### Custom VM Arguments

You can add custom QEMU arguments through the VM settings:
- CPU flags
- Network configurations
- PCI device passthrough
- Custom drive configurations

## Development

### Building from Source

1. Setup development environment:
```bash
npm install
```

2. Run in development mode:
```bash
npm run dev
```

3. Build for production:
```bash
npm run build
```

### Project Structure

- `src/main/` - Main process code
- `src/renderer/` - Renderer process code
- `src/main/cephStorage.js` - VM storage management
- `src/main/sharedStorage.js` - Shared folder functionality

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

[Your License Here]

## Support

For issues and feature requests, please use the GitHub issue tracker.

# Technical Details

## File Formats

### VM Disk Formats

1. **QCOW2 (QEMU Copy-On-Write version 2)**
   - Primary disk format used by Hypercore
   - Features:
     - Thin provisioning (disk space allocated as needed)
     - Snapshots support
     - AES encryption support
     - Compression support
   ```bash
   # Create a new QCOW2 image
   qemu-img create -f qcow2 disk.qcow2 20G
   
   # Convert from raw to QCOW2
   qemu-img convert -f raw -O qcow2 disk.raw disk.qcow2
   
   # Get image info
   qemu-img info disk.qcow2
   ```

2. **Raw Format**
   - Simple bit-by-bit copy of disk contents
   - Used for maximum performance
   - No built-in features like snapshots
   ```bash
   # Create a raw image
   qemu-img create -f raw disk.raw 20G
   ```

### Source Code Organization

1. **TypeScript Files (.ts)**
   - Used for type-safe application logic
   - Located in:
     - `src/renderer/` - Frontend UI components
     - `src/types/` - Type definitions
   
   Example Component (`src/renderer/components/VMList.tsx`):
   ```typescript
   interface VMProps {
     name: string;
     state: 'running' | 'stopped';
     ram: number;
     cpus: number;
   }
   
   const VMList: React.FC<VMProps[]> = (vms) => {
     // Component implementation
   };
   ```

2. **JavaScript Files (.js)**
   - Used for configuration and build scripts
   - Core functionality implementation
   
   Example (`src/main/cephStorage.js`):
   ```javascript
   const STORAGE_CONFIG = {
     baseDir: path.join(os.homedir(), '.hypercore', 'vms'),
     defaultSizes: {
       disk: 20,
       ram: 2048,
       cpus: 2
     }
   };
   ```

3. **React Components (.tsx)**
   - UI components with TypeScript
   - Located in `src/renderer/components/`
   
   Example:
   ```tsx
   import React from 'react';
   import { VMStatus } from '../types';
   
   interface VMCardProps {
     vm: VMStatus;
     onStart: () => void;
     onStop: () => void;
   }
   ```

## Machine State Management

### 1. Runtime State

VM state is stored in multiple locations:

1. **Memory State**
   - Location: RAM
   - Files: None (volatile)
   - Used for: Active VM execution

2. **Disk State**
   - Location: `~/.hypercore/vms/<vm-name>/disk.qcow2`
   - Format: QCOW2
   - Contains: VM's disk data

3. **Configuration State**
   - Location: `~/.config/hypercore-gui/config.json`
   - Format: JSON
   - Contains:
   ```json
   {
     "vm": {
       "vm-name": {
         "ram": 4096,
         "cpus": 4,
         "diskImage": "/path/to/disk.qcow2",
         "state": "running",
         "hasBooted": true
       }
     }
   }
   ```

### 2. Snapshot Management

Snapshots are managed through QEMU's internal snapshot system:

1. **Live Snapshots**
   ```javascript
   // Creating a snapshot
   async function createVmSnapshot(vmName, snapshotName) {
     const diskImage = path.join(vmDir, 'disk.qcow2');
     await execPromise(`qemu-img snapshot -c "${snapshotName}" "${diskImage}"`);
   }
   ```

2. **Snapshot Metadata**
   - Stored within QCOW2 file
   - View with:
   ```bash
   qemu-img snapshot -l disk.qcow2
   ```

### 3. Installation State

Tracks OS installation status:
```json
// ~/.hypercore/vms/<vm-name>/installation_state.json
{
  "isInstalled": true,
  "lastModified": "2024-03-26T12:00:00Z"
}
```

## Core Components

### 1. VM Management (`src/main/cephStorage.js`)
- VM lifecycle management
- Disk operations
- Snapshot handling
- QEMU process control

### 2. Shared Storage (`src/main/sharedStorage.js`)
- 9P filesystem setup
- Mount script generation
- Guest agent integration

### 3. System Monitoring (`src/main/services/MonitoringService.ts`)
- Resource usage tracking
- Performance metrics
- System health checks

### 4. UI Components (`src/renderer/components/`)
- VM control interface
- Resource monitors
- Settings panels
- Snapshot management

### 5. IPC Communication (`src/main/main.js`)
- Host-VM communication
- Event handling
- Command execution

## File Locations

```plaintext
hypercore-gui/
├── src/
│   ├── main/                 # Main process (Node.js)
│   │   ├── cephStorage.js    # VM storage management
│   │   ├── sharedStorage.js  # Shared folder handling
│   │   └── services/         # Background services
│   ├── renderer/             # UI process (React)
│   │   ├── components/       # React components
│   │   └── styles/          # CSS/SCSS files
│   └── types/               # TypeScript definitions
├── dist/                    # Compiled files
└── .hypercore/             # Runtime data
    ├── vms/                # VM disk images
    └── shared_folder/      # Shared storage
```

## Performance Considerations

1. **Disk Format Selection**
   - QCOW2: Better features, slightly lower performance
   - Raw: Maximum performance, no snapshots
   - Recommendation: Use QCOW2 with cache=writeback

2. **Memory Management**
   - Use of KVM for near-native performance
   - Memory ballooning for dynamic allocation
   - Huge pages support for better performance

3. **Network Configuration**
   - Virtio drivers for optimal performance
   - Support for various network modes:
     - User mode (default)
     - Bridged
     - NAT
     - Host-only

