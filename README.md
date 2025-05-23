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

