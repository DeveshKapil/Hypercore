import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ResourceData {
  cpu: number;
  memory: number;
  disk: number;
  timestamp: number;
}

interface ResourceMonitorProps {
  vmName: string;
}

const ResourceMonitor: React.FC<ResourceMonitorProps> = ({ vmName }) => {
  const [resourceHistory, setResourceHistory] = useState<ResourceData[]>([]);
  const [currentUsage, setCurrentUsage] = useState<ResourceData>({
    cpu: 0,
    memory: 0,
    disk: 0,
    timestamp: Date.now(),
  });

  const { ipcRenderer } = window.require('electron');

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const usage = await ipcRenderer.invoke('get-vm-resources', vmName);
        const newData = {
          ...usage,
          timestamp: Date.now(),
        };

        setCurrentUsage(newData);
        setResourceHistory((prev) => {
          const newHistory = [...prev, newData];
          if (newHistory.length > 60) {
            // Keep last 60 data points (1 minute with 1-second intervals)
            return newHistory.slice(-60);
          }
          return newHistory;
        });
      } catch (error) {
        console.error('Failed to get resource usage:', error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [vmName]);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Resource Monitor
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            CPU Usage: {currentUsage.cpu.toFixed(1)}%
          </Typography>
          <LinearProgress
            variant="determinate"
            value={currentUsage.cpu}
            sx={{ height: 10, borderRadius: 5 }}
          />
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Memory Usage: {currentUsage.memory.toFixed(1)}%
          </Typography>
          <LinearProgress
            variant="determinate"
            value={currentUsage.memory}
            sx={{ height: 10, borderRadius: 5 }}
          />
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Disk Usage: {currentUsage.disk.toFixed(1)}%
          </Typography>
          <LinearProgress
            variant="determinate"
            value={currentUsage.disk}
            sx={{ height: 10, borderRadius: 5 }}
          />
        </Box>

        <Box sx={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={resourceHistory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(timestamp) => new Date(timestamp).toLocaleTimeString()}
              />
              <YAxis />
              <Tooltip
                labelFormatter={(timestamp) => new Date(timestamp).toLocaleTimeString()}
              />
              <Line
                type="monotone"
                dataKey="cpu"
                stroke="#8884d8"
                name="CPU"
              />
              <Line
                type="monotone"
                dataKey="memory"
                stroke="#82ca9d"
                name="Memory"
              />
              <Line
                type="monotone"
                dataKey="disk"
                stroke="#ffc658"
                name="Disk"
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ResourceMonitor; 