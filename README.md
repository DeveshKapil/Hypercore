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

