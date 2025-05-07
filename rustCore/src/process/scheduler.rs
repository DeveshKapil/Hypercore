use alloc::collections::VecDeque;
use alloc::boxed::Box;
use core::time::Duration;
use spin::Mutex;
use lazy_static::lazy_static;

// Process states
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessState {
    Ready,
    Running,
    Blocked,
    Terminated,
}

// Process structure
#[derive(Debug)]
pub struct Process {
    pub pid: u64,
    pub state: ProcessState,
    pub priority: u8,
    pub burst_time: Duration,
    pub arrival_time: Duration,
    pub waiting_time: Duration,
    pub response_ratio: f64,
    pub time_quantum: Duration,
    pub remaining_time: Duration,
}

impl Process {
    pub fn new(pid: u64, burst_time: Duration, arrival_time: Duration) -> Self {
        Process {
            pid,
            state: ProcessState::Ready,
            priority: 0,
            burst_time,
            arrival_time,
            waiting_time: Duration::from_secs(0),
            response_ratio: 0.0,
            time_quantum: Duration::from_millis(100), // Default quantum
            remaining_time: burst_time,
        }
    }

    pub fn update_response_ratio(&mut self, current_time: Duration) {
        let waiting_time = current_time.as_secs_f64() - self.arrival_time.as_secs_f64();
        self.response_ratio = (waiting_time + self.burst_time.as_secs_f64()) / self.burst_time.as_secs_f64();
    }
}

// Queue levels
const QUEUE_LEVELS: usize = 3;
const LEVEL1_QUANTUM: Duration = Duration::from_millis(100);
const LEVEL2_QUANTUM: Duration = Duration::from_millis(200);

pub struct MultiFeedbackQueue {
    queues: [VecDeque<Process>; QUEUE_LEVELS],
    current_time: Duration,
}

impl MultiFeedbackQueue {
    pub fn new() -> Self {
        MultiFeedbackQueue {
            queues: [VecDeque::new(), VecDeque::new(), VecDeque::new()],
            current_time: Duration::from_secs(0),
        }
    }

    pub fn add_process(&mut self, process: Process) {
        self.queues[0].push_back(process);
    }

    pub fn schedule(&mut self) -> Option<&mut Process> {
        // Try to get a process from each queue in order
        for level in 0..QUEUE_LEVELS {
            if let Some(process) = self.queues[level].front_mut() {
                match level {
                    0 | 1 => {
                        // Round Robin for first two levels
                        if process.remaining_time <= process.time_quantum {
                            // Process will complete
                            process.state = ProcessState::Running;
                            return Some(process);
                        } else {
                            // Process needs more time
                            process.remaining_time -= process.time_quantum;
                            // Move to next level if in first queue
                            if level == 0 {
                                let mut process = self.queues[0].pop_front().unwrap();
                                process.time_quantum = LEVEL2_QUANTUM;
                                self.queues[1].push_back(process);
                            }
                            return Some(process);
                        }
                    }
                    2 => {
                        // HRNN for the final level
                        self.update_response_ratios();
                        // Find process with highest response ratio
                        let mut highest_ratio = 0.0;
                        let mut highest_idx = 0;
                        
                        for (i, p) in self.queues[2].iter().enumerate() {
                            if p.response_ratio > highest_ratio {
                                highest_ratio = p.response_ratio;
                                highest_idx = i;
                            }
                        }
                        
                        // Move the selected process to front
                        if highest_idx > 0 {
                            let process = self.queues[2].remove(highest_idx).unwrap();
                            self.queues[2].push_front(process);
                        }
                        
                        return self.queues[2].front_mut();
                    }
                    _ => unreachable!(),
                }
            }
        }
        None
    }

    fn update_response_ratios(&mut self) {
        for process in self.queues[2].iter_mut() {
            process.update_response_ratio(self.current_time);
        }
    }

    pub fn tick(&mut self) {
        self.current_time += Duration::from_millis(1);
        // Update waiting times for all processes
        for queue in self.queues.iter_mut() {
            for process in queue.iter_mut() {
                if process.state == ProcessState::Ready {
                    process.waiting_time += Duration::from_millis(1);
                }
            }
        }
    }

    pub fn complete_process(&mut self, pid: u64) {
        for queue in self.queues.iter_mut() {
            if let Some(pos) = queue.iter().position(|p| p.pid == pid) {
                let mut process = queue.remove(pos).unwrap();
                process.state = ProcessState::Terminated;
                break;
            }
        }
    }
}

// Global scheduler instance
lazy_static! {
    pub static ref SCHEDULER: Mutex<MultiFeedbackQueue> = Mutex::new(MultiFeedbackQueue::new());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mfq_scheduling() {
        let mut scheduler = MultiFeedbackQueue::new();
        
        // Create test processes
        let p1 = Process::new(1, Duration::from_millis(150), Duration::from_millis(0));
        let p2 = Process::new(2, Duration::from_millis(300), Duration::from_millis(0));
        let p3 = Process::new(3, Duration::from_millis(500), Duration::from_millis(0));
        
        // Add processes to scheduler
        scheduler.add_process(p1);
        scheduler.add_process(p2);
        scheduler.add_process(p3);
        
        // Test scheduling
        let process = scheduler.schedule();
        assert!(process.is_some());
        assert_eq!(process.unwrap().pid, 1);
        
        // Simulate some time passing
        scheduler.tick();
        scheduler.tick();
        
        // Test process completion
        scheduler.complete_process(1);
        let process = scheduler.schedule();
        assert!(process.is_some());
        assert_eq!(process.unwrap().pid, 2);
    }
} 