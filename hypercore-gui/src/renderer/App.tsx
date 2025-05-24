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
  IconButton,
  Collapse,
  InputAdornment,
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
} from '@mui/icons-material';
import ResourceMonitor from './components/ResourceMonitor';
import FileDialog from './components/FileDialog';

const { ipcRenderer } = window.require('electron');

interface VM {
  name: string;
  ram: number;
  cpus: number;
  systemDisk: string;
  dataDisk: string;
  iso?: string;
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

  useEffect(() => {
    loadVMs();
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
    return true;
  };

  const handleCreateVM = async () => {
    try {
      console.log('Creating VM with config:', newVm);
      setError(null);
      if (!validateVmConfig(newVm)) {
        console.log('Validation failed');
        return;
      }

      console.log('Sending create-vm request to main process');
      const result = await ipcRenderer.invoke('create-vm', newVm);
      console.log('Received result:', result);
      
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
    }
  };

  const handleDeleteVM = async (name: string) => {
    try {
      await ipcRenderer.invoke('delete-vm', { name });
      await loadVMs();
    } catch (error) {
      console.error('Failed to delete VM:', error);
    }
  };

  const handleCloneVM = async (source: string) => {
    const target = `${source}-clone`;
    try {
      await ipcRenderer.invoke('clone-vm', { source, target });
      await loadVMs();
    } catch (error) {
      console.error('Failed to clone VM:', error);
    }
  };

  const handleSnapshotVM = async (name: string) => {
    const snapshotName = `${name}-snapshot-${Date.now()}`;
    try {
      await ipcRenderer.invoke('snapshot-vm', { name, snapshotName });
    } catch (error) {
      console.error('Failed to create snapshot:', error);
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

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Hypercore VM Manager
          </Typography>
          <IconButton color="inherit" onClick={() => setCreateDialogOpen(true)}>
            <AddIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container sx={{ mt: 4 }}>
        <Grid container spacing={3}>
          {Object.entries(vms).map(([name, vm]) => (
            <Grid item xs={12} key={name}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="h6">{name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        RAM: {vm.ram}MB | CPUs: {vm.cpus}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        System Disk: {vm.systemDisk}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Data Disk: {vm.dataDisk}
                      </Typography>
                    </Box>
                    <Box>
                      <IconButton onClick={() => handleCloneVM(name)}>
                        <CloneIcon />
                      </IconButton>
                      <IconButton onClick={() => handleSnapshotVM(name)}>
                        <SnapshotIcon />
                      </IconButton>
                      <IconButton onClick={() => handleDeleteVM(name)}>
                        <DeleteIcon />
                      </IconButton>
                      <IconButton>
                        <SettingsIcon />
                      </IconButton>
                      <IconButton
                        onClick={() => toggleExpand(name)}
                        sx={{
                          transform: expandedVM === name ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.3s',
                        }}
                      >
                        <ExpandMoreIcon />
                      </IconButton>
                    </Box>
                  </Box>
                </CardContent>
                <Collapse in={expandedVM === name}>
                  <CardContent>
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
    </Box>
  );
}

export default App; 