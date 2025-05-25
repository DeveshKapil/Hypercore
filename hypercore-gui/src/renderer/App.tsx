import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  AppBar,
  Toolbar,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Collapse,
  InputAdornment,
  CircularProgress,
  Paper,
  IconButton,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  FileCopy as CloneIcon,
  Camera as SnapshotIcon,
  Restore as RestoreIcon,
  Settings as SettingsIcon,
  ExpandMore as ExpandMoreIcon,
  FolderOpen as FolderIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Storage as StorageIcon,
  Close as CloseIcon,
  PowerOff as KillIcon,
  Eject as EjectIcon,
} from '@mui/icons-material';
import { MenuIconButton, MenuContainer } from './components/StyledMenu';
import ResourceMonitor from './components/ResourceMonitor';
import FileDialog from './components/FileDialog';
import { IpcRendererEvent } from 'electron';
import path from 'path';

const { ipcRenderer } = window.require('electron');

interface VM {
  name: string;
  ram: number;
  cpus: number;
  systemDisk: string;
  dataDisk: string;
  iso?: string;
  state: string;
  hasBooted?: boolean;
  bootOrder?: string;
  sharedStorageAttached: boolean;
  storageSize?: number;
}

function App() {
  const [vms, setVms] = useState<Record<string, VM>>({});
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newVm, setNewVm] = useState<Partial<VM>>({});
  const [expandedVM, setExpandedVM] = useState<string | null>(null);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [fileDialogConfig, setFileDialogConfig] = useState<{
    title: string;
    selectMode: 'file' | 'directory';
    onSelect: (path: string) => void;
  }>({
    title: '',
    selectMode: 'file',
    onSelect: () => {},
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState('');
  const [terminalDialogOpen, setTerminalDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [selectedVM, setSelectedVM] = useState<string | null>(null);
  const [vmSettings, setVmSettings] = useState<Partial<VM>>({});

  useEffect(() => {
    loadVMs();
    ipcRenderer.on('terminal-output', (_event: IpcRendererEvent, output: string) => {
      setTerminalOutput(prev => prev + '\n' + output);
      setTerminalDialogOpen(true);
    });

    // Set up periodic status check
    const statusCheckInterval = setInterval(async () => {
      try {
        // Get current VM states
        const states = await ipcRenderer.invoke('check-vm-states') as Record<string, string>;
        
        // Update VM states
        setVms(prevVms => {
          const updatedVms = { ...prevVms };
          Object.entries(states).forEach(([name, state]) => {
            if (updatedVms[name] && updatedVms[name].state !== state) {
              updatedVms[name] = { ...updatedVms[name], state };
            }
          });
          return updatedVms;
        });
      } catch (error) {
        console.error('Failed to check VM states:', error);
      }
    }, 5000); // Check every 5 seconds

    return () => {
      ipcRenderer.removeAllListeners('terminal-output');
      clearInterval(statusCheckInterval);
    };
  }, []);

  const loadVMs = async () => {
    const configs = await ipcRenderer.invoke('get-vm-configs');
    setVms(configs);
  };

  const validateVmConfig = (vm: Partial<VM>): boolean => {
    if (!vm.name || vm.name.trim() === '') {
      setError('VM name is required');
      return false;
    }
    if (!vm.ram || vm.ram < 512) {
      setError('RAM must be at least 512MB');
      return false;
    }
    if (!vm.cpus || vm.cpus < 1) {
      setError('At least 1 CPU is required');
      return false;
    }
    if (!vm.storageSize || vm.storageSize < 10) {
      setError('Storage size must be at least 10GB');
      return false;
    }
    return true;
  };

  const handleCreateVM = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setTerminalOutput('');
      
      if (!validateVmConfig(newVm)) {
        setIsLoading(false);
        return;
      }

      const result = await ipcRenderer.invoke('create-vm', newVm);
      
      if (result.success) {
        await loadVMs();
        setCreateDialogOpen(false);
        setNewVm({});
      } else {
        setError('Failed to create VM: ' + result.error);
      }
    } catch (err: any) {
      console.error('Failed to create VM:', err);
      setError('Failed to create VM: ' + (err.message || 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteVM = async (name: string) => {
    try {
      setIsLoading(true);
      setTerminalOutput('');
      await ipcRenderer.invoke('delete-vm', { name });
      await loadVMs();
    } catch (error) {
      console.error('Failed to delete VM:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloneVM = async (source: string) => {
    try {
      setIsLoading(true);
      setTerminalOutput('');
      const target = `${source}-clone`;
      await ipcRenderer.invoke('clone-vm', { source, target });
      await loadVMs();
    } catch (error) {
      console.error('Failed to clone VM:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSnapshotVM = async (name: string) => {
    try {
      setIsLoading(true);
      setTerminalOutput('');
      const snapshotName = `${name}-snapshot-${Date.now()}`;
      await ipcRenderer.invoke('snapshot-vm', { name, snapshotName });
    } catch (error) {
      console.error('Failed to create snapshot:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpand = (name: string) => {
    setExpandedVM(expandedVM === name ? null : name);
  };

  const openFileDialog = (
    title: string,
    selectMode: 'file' | 'directory',
    onSelect: (path: string) => void
  ) => {
    setFileDialogConfig({ title, selectMode, onSelect });
    setFileDialogOpen(true);
  };

  const handleToggleSharedStorage = async (name: string) => {
    try {
      setIsLoading(true);
      setTerminalOutput('');
      const vm = vms[name];
      
      if (vm.sharedStorageAttached) {
        await ipcRenderer.invoke('detach-shared-storage', { name });
      } else {
        await ipcRenderer.invoke('attach-shared-storage', { name });
      }
      
      await loadVMs();
    } catch (error) {
      console.error('Failed to toggle shared storage:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartVM = async (name: string) => {
    try {
      setIsLoading(true);
      setTerminalOutput('');
      await ipcRenderer.invoke('start-vm', { name });
      await loadVMs();
    } catch (error) {
      console.error('Failed to start VM:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopVM = async (name: string) => {
    try {
      setIsLoading(true);
      setTerminalOutput('');
      await ipcRenderer.invoke('stop-vm', { name });
      await loadVMs();
    } catch (error) {
      console.error('Failed to stop VM:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKillVM = async (name: string) => {
    try {
      setIsLoading(true);
      setTerminalOutput('');
      await ipcRenderer.invoke('force-kill-vm', { name });
      await loadVMs();
    } catch (error) {
      console.error('Failed to kill VM:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateSettings = async () => {
    try {
      if (!selectedVM) return;
      
      setIsLoading(true);
      setTerminalOutput('');
      
      await ipcRenderer.invoke('update-vm-settings', {
        name: selectedVM,
        settings: vmSettings
      });
      
      await loadVMs();
      setSettingsDialogOpen(false);
    } catch (error) {
      console.error('Failed to update VM settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenSettings = (name: string) => {
    setSelectedVM(name);
    setVmSettings(vms[name]);
    setSettingsDialogOpen(true);
  };

  const handleDetachIso = async (vmName: string) => {
    try {
      await ipcRenderer.invoke('detach-iso', { name: vmName });
      // Refresh VM list
      loadVMs();
    } catch (error) {
      console.error('Failed to detach ISO:', error);
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Hypercore VM Manager
          </Typography>
          <MenuContainer>
            <MenuIconButton
              icon={AddIcon}
              tooltip="Create New VM"
              onClick={() => setCreateDialogOpen(true)}
            />
            <MenuIconButton
              icon={SettingsIcon}
              tooltip="Settings"
              onClick={() => {/* TODO: Implement settings */}}
            />
          </MenuContainer>
        </Toolbar>
      </AppBar>

      <Container sx={{ mt: 4 }}>
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <CircularProgress />
          </Box>
        )}
        <Grid container spacing={3}>
          {Object.entries(vms).map(([name, vm]) => (
            <Grid item xs={12} md={6} key={name}>
              <Card sx={{ 
                minHeight: '300px',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'background.paper',
                boxShadow: 3,
                '&:hover': {
                  boxShadow: 6,
                },
              }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    gap: 2,
                  }}>
                    <Box sx={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <Typography variant="h5" component="div" sx={{ fontWeight: 'bold' }}>
                        {name}
                      </Typography>
                      <Typography 
                        variant="subtitle1" 
                        sx={{ 
                          color: vm.state === 'running' ? 'success.main' : 'text.secondary',
                          fontWeight: 'medium',
                        }}
                      >
                        {vm.state === 'running' ? '● Running' : '○ Stopped'}
                      </Typography>
                    </Box>
                    
                    <Box sx={{ display: 'flex', gap: 4 }}>
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary">
                          Resources
                        </Typography>
                        <Typography variant="body1">
                          RAM: {vm.ram}MB
                        </Typography>
                        <Typography variant="body1">
                          CPUs: {vm.cpus}
                        </Typography>
                      </Box>
                      
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary">
                          Storage
                        </Typography>
                        <Typography variant="body1">
                          System: {vm.systemDisk}
                        </Typography>
                        <Typography variant="body1" sx={{
                          color: vm.sharedStorageAttached ? 'success.main' : 'text.secondary'
                        }}>
                          Shared Storage: {vm.sharedStorageAttached ? 'Connected' : 'Not Connected'}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </CardContent>

                <CardActions sx={{ 
                  borderTop: 1, 
                  borderColor: 'divider',
                  backgroundColor: 'background.default',
                  p: 2,
                }}>
                  <MenuContainer>
                    <MenuIconButton
                      icon={StartIcon}
                      tooltip="Start VM"
                      onClick={() => handleStartVM(name)}
                      disabled={vm.state === 'running'}
                      color="success"
                    />
                    <MenuIconButton
                      icon={StopIcon}
                      tooltip="Stop VM (Graceful Shutdown)"
                      onClick={() => handleStopVM(name)}
                      disabled={vm.state !== 'running'}
                      color="warning"
                    />
                    <MenuIconButton
                      icon={KillIcon}
                      tooltip="Force Kill VM"
                      onClick={() => handleKillVM(name)}
                      disabled={vm.state !== 'running'}
                      color="error"
                    />
                    <MenuIconButton
                      icon={StorageIcon}
                      tooltip={vm.sharedStorageAttached ? "Detach Shared Storage" : "Attach Shared Storage"}
                      onClick={() => handleToggleSharedStorage(name)}
                      disabled={vm.state !== 'running'}
                      color={vm.sharedStorageAttached ? "warning" : "primary"}
                    />
                    <MenuIconButton
                      icon={SettingsIcon}
                      tooltip="VM Settings"
                      onClick={() => handleOpenSettings(name)}
                      color="info"
                    />
                    <MenuIconButton
                      icon={CloneIcon}
                      tooltip="Clone VM"
                      onClick={() => handleCloneVM(name)}
                      disabled={vm.state === 'running'}
                    />
                    <MenuIconButton
                      icon={SnapshotIcon}
                      tooltip="Create Snapshot"
                      onClick={() => handleSnapshotVM(name)}
                      disabled={vm.state === 'running'}
                    />
                    <MenuIconButton
                      icon={DeleteIcon}
                      tooltip="Delete VM"
                      onClick={() => handleDeleteVM(name)}
                      disabled={vm.state === 'running'}
                      color="error"
                    />
                    <MenuIconButton
                      icon={ExpandMoreIcon}
                      tooltip={expandedVM === name ? "Hide Details" : "Show Details"}
                      onClick={() => toggleExpand(name)}
                      sx={{
                        transform: expandedVM === name ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.3s',
                      }}
                    />
                  </MenuContainer>
                </CardActions>

                <Collapse in={expandedVM === name}>
                  <CardContent sx={{ 
                    backgroundColor: 'background.default',
                    borderTop: 1,
                    borderColor: 'divider',
                  }}>
                    <ResourceMonitor vmName={name} />
                  </CardContent>
                </Collapse>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
        <DialogTitle>Create New VM</DialogTitle>
        <DialogContent>
          {error && (
            <Typography color="error" sx={{ mb: 2 }}>
              {error}
            </Typography>
          )}
          <TextField
            autoFocus
            margin="dense"
            label="VM Name"
            fullWidth
            required
            error={!newVm.name}
            value={newVm.name || ''}
            onChange={(e) => {
              console.log('Setting VM name:', e.target.value);
              setNewVm({ ...newVm, name: e.target.value });
            }}
          />
          <TextField
            margin="dense"
            label="RAM (MB)"
            type="number"
            fullWidth
            required
            error={!newVm.ram || newVm.ram < 512}
            helperText="Minimum 512MB"
            value={newVm.ram || ''}
            onChange={(e) => {
              const ram = parseInt(e.target.value);
              console.log('Setting RAM:', ram);
              setNewVm({ ...newVm, ram });
            }}
          />
          <TextField
            margin="dense"
            label="CPUs"
            type="number"
            fullWidth
            required
            error={!newVm.cpus || newVm.cpus < 1}
            helperText="Minimum 1 CPU"
            value={newVm.cpus || ''}
            onChange={(e) => {
              const cpus = parseInt(e.target.value);
              console.log('Setting CPUs:', cpus);
              setNewVm({ ...newVm, cpus });
            }}
          />
          <TextField
            margin="dense"
            label="Storage Size (GB)"
            type="number"
            fullWidth
            required
            error={!newVm.storageSize || newVm.storageSize < 10}
            helperText="Minimum 10GB recommended"
            value={newVm.storageSize || ''}
            onChange={(e) => {
              const storageSize = parseInt(e.target.value);
              console.log('Setting storage size:', storageSize);
              setNewVm({ ...newVm, storageSize });
            }}
          />
          <TextField
            margin="dense"
            label="System Disk"
            fullWidth
            value={newVm.systemDisk || ''}
            disabled
          />
          <TextField
            margin="dense"
            label="Data Disk"
            fullWidth
            value={newVm.dataDisk || ''}
            disabled
          />
          <TextField
            margin="dense"
            label="ISO Path (optional)"
            fullWidth
            value={newVm.iso || ''}
            onChange={(e) => setNewVm({ ...newVm, iso: e.target.value })}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() =>
                      openFileDialog('Select ISO File', 'file', (path) =>
                        setNewVm({ ...newVm, iso: path })
                      )
                    }
                  >
                    <FolderIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            console.log('Cancel clicked');
            setCreateDialogOpen(false);
          }}>
            Cancel
          </Button>
          <Button 
            onClick={() => {
              console.log('Create button clicked');
              handleCreateVM();
            }}
            variant="contained" 
            color="primary"
            disabled={!newVm.name || !newVm.ram || !newVm.cpus}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={terminalDialogOpen}
        onClose={() => setTerminalDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Terminal Output</DialogTitle>
        <DialogContent>
          <Paper
            sx={{
              p: 2,
              backgroundColor: '#000',
              color: '#fff',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              minHeight: '200px',
              maxHeight: '400px',
              overflow: 'auto'
            }}
          >
            {terminalOutput || 'No output available'}
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTerminalDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <FileDialog
        open={fileDialogOpen}
        onClose={() => setFileDialogOpen(false)}
        title={fileDialogConfig.title}
        selectMode={fileDialogConfig.selectMode}
        onSelect={(path) => {
          fileDialogConfig.onSelect(path);
          setFileDialogOpen(false);
        }}
        fileFilter={['.iso']}
      />

      <Dialog 
        open={settingsDialogOpen} 
        onClose={() => setSettingsDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">VM Settings</Typography>
            <IconButton onClick={() => setSettingsDialogOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <TextField
              fullWidth
              label="RAM (MB)"
              type="number"
              value={vmSettings.ram || ''}
              onChange={(e) => setVmSettings({ ...vmSettings, ram: parseInt(e.target.value) })}
              sx={{ mb: 2 }}
              helperText="Minimum 512MB recommended"
            />
            <TextField
              fullWidth
              label="CPUs"
              type="number"
              value={vmSettings.cpus || ''}
              onChange={(e) => setVmSettings({ ...vmSettings, cpus: parseInt(e.target.value) })}
              sx={{ mb: 2 }}
              helperText="Number of CPU cores"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={vmSettings.sharedStorageAttached}
                  onChange={(e) => setVmSettings({ ...vmSettings, sharedStorageAttached: e.target.checked })}
                  disabled={!selectedVM || vms[selectedVM!]?.state !== 'running'}
                />
              }
              label="Shared Storage"
            />
            {vms[selectedVM!]?.state === 'running' && (
              <Typography variant="caption" color="text.secondary" display="block">
                Note: Some settings can only be changed when the VM is stopped
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleUpdateSettings}
            variant="contained" 
            color="primary"
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default App; 