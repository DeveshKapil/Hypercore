use super::scheduler::{Process, ProcessState, SCHEDULER};
use alloc::boxed::Box;
use core::time::Duration;
use spin::Mutex;
use lazy_static::lazy_static;

pub struct ProcessManager {
    next_pid: u64,
}

impl ProcessManager {
    pub fn new() -> Self {
        ProcessManager {
            next_pid: 1,
        }
    }

    pub fn create_process(&mut self, burst_time: Duration) -> u64 {
        let pid = self.next_pid;
        self.next_pid += 1;

        let process = Process::new(
            pid,
            burst_time,
            Duration::from_secs(0), // Current time would be passed in real implementation
        );

        SCHEDULER.lock().add_process(process);
        pid
    }

    pub fn terminate_process(&mut self, pid: u64) {
        SCHEDULER.lock().complete_process(pid);
    }

    pub fn get_process_state(&self, pid: u64) -> Option<ProcessState> {
        let scheduler = SCHEDULER.lock();
        // Search through all queues for the process
        for queue in scheduler.queues.iter() {
            if let Some(process) = queue.iter().find(|p| p.pid == pid) {
                return Some(process.state);
            }
        }
        None
    }

    pub fn schedule_next(&mut self) -> Option<&mut Process> {
        SCHEDULER.lock().schedule()
    }

    pub fn tick(&mut self) {
        SCHEDULER.lock().tick();
    }
}

lazy_static! {
    pub static ref PROCESS_MANAGER: Mutex<ProcessManager> = Mutex::new(ProcessManager::new());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_creation() {
        let mut manager = ProcessManager::new();
        
        let pid1 = manager.create_process(Duration::from_millis(100));
        let pid2 = manager.create_process(Duration::from_millis(200));
        
        assert_eq!(pid1, 1);
        assert_eq!(pid2, 2);
        
        assert_eq!(manager.get_process_state(pid1), Some(ProcessState::Ready));
        assert_eq!(manager.get_process_state(pid2), Some(ProcessState::Ready));
    }

    #[test]
    fn test_process_termination() {
        let mut manager = ProcessManager::new();
        
        let pid = manager.create_process(Duration::from_millis(100));
        manager.terminate_process(pid);
        
        assert_eq!(manager.get_process_state(pid), Some(ProcessState::Terminated));
    }
} 