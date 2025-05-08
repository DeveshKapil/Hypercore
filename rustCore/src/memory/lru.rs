use alloc::collections::{BTreeMap, VecDeque};
use alloc::boxed::Box;
use core::hash::Hash;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PageKey {
    pub address: u64,
    pub size: usize,
}

pub struct LRUCache {
    capacity: usize,
    map: BTreeMap<PageKey, Box<[u8]>>,
    order: VecDeque<PageKey>,
}

impl LRUCache {
    pub fn new(capacity: usize) -> Self {
        LRUCache {
            capacity,
            map: BTreeMap::new(),
            order: VecDeque::new(),
        }
    }

    pub fn get(&mut self, key: &PageKey) -> Option<&[u8]> {
        if let Some(val) = self.map.get(key) {
            // Move to back (most recently used)
            if let Some(pos) = self.order.iter().position(|k| k == key) {
                let k = self.order.remove(pos).unwrap();
                self.order.push_back(k);
            }
            Some(val)
        } else {
            None
        }
    }

    pub fn put(&mut self, key: PageKey, value: Box<[u8]>) {
        if self.map.contains_key(&key) {
            // Update value and move to back
            self.map.insert(key, value);
            if let Some(pos) = self.order.iter().position(|k| k == &key) {
                self.order.remove(pos);
            }
            self.order.push_back(key);
        } else {
            if self.map.len() == self.capacity {
                if let Some(oldest) = self.order.pop_front() {
                    self.map.remove(&oldest);
                }
            }
            self.map.insert(key, value);
            self.order.push_back(key);
        }
    }

    pub fn remove(&mut self, key: &PageKey) -> Option<Box<[u8]>> {
        if let Some(pos) = self.order.iter().position(|k| k == key) {
            self.order.remove(pos);
        }
        self.map.remove(key)
    }
} 