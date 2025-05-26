import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Grid } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface SystemMetrics {
  cpu: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
}

interface MetricHistory {
  timestamp: number;
  value: number;
}

const MAX_HISTORY_POINTS = 60; // 1 minute of history at 1-second intervals

export const SystemMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [cpuHistory, setCpuHistory] = useState<MetricHistory[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<MetricHistory[]>([]);
  const [diskHistory, setDiskHistory] = useState<MetricHistory[]>([]);

  useEffect(() => {
    // Initial metrics fetch
    window.electron.invoke('get-system-metrics').then(setMetrics);

    // Subscribe to metric updates
    const unsubscribe = window.electron.on('system-metrics-update', (newMetrics: SystemMetrics) => {
      setMetrics(newMetrics);
      
      const now = Date.now();
      
      // Update histories
      setCpuHistory(prev => [
        ...prev.slice(-MAX_HISTORY_POINTS + 1),
        { timestamp: now, value: newMetrics.cpu }
      ]);
      
      setMemoryHistory(prev => [
        ...prev.slice(-MAX_HISTORY_POINTS + 1),
        { timestamp: now, value: newMetrics.memory.percentage }
      ]);
      
      setDiskHistory(prev => [
        ...prev.slice(-MAX_HISTORY_POINTS + 1),
        { timestamp: now, value: newMetrics.disk.percentage }
      ]);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const MetricCard: React.FC<{
    title: string;
    value: number;
    total?: number;
    data: MetricHistory[];
    color: string;
  }> = ({ title, value, total, data, color }) => (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <Typography variant="h4" color="primary">
          {value.toFixed(1)}%
        </Typography>
        {total && (
          <Typography variant="body2" color="textSecondary">
            {formatBytes(value * total / 100)} / {formatBytes(total)}
          </Typography>
        )}
        <Box sx={{ height: 150, mt: 2 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={['auto', 'auto']}
                tickFormatter={(timestamp) => new Date(timestamp).toLocaleTimeString()}
              />
              <YAxis domain={[0, 100]} />
              <Tooltip
                labelFormatter={(timestamp) => new Date(timestamp).toLocaleTimeString()}
                formatter={(value: number) => [`${value.toFixed(1)}%`, title]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  );

  if (!metrics) {
    return <Typography>Loading system metrics...</Typography>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        System Monitor
      </Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <MetricCard
            title="CPU Usage"
            value={metrics.cpu}
            data={cpuHistory}
            color="#2196f3"
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <MetricCard
            title="Memory Usage"
            value={metrics.memory.percentage}
            total={metrics.memory.total}
            data={memoryHistory}
            color="#4caf50"
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <MetricCard
            title="Disk Usage"
            value={metrics.disk.percentage}
            total={metrics.disk.total}
            data={diskHistory}
            color="#ff9800"
          />
        </Grid>
      </Grid>
    </Box>
  );
}; 