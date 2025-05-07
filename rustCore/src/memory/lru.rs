use core::hash::Hash;
use alloc::collections::HashMap;
use alloc::collections::VecDeque;
use alloc::boxed::Box;

pub struct LRUCache<K, V> {
    capacity: usize,
    cache: HashMap<K, (V, usize)>, // (value, timestamp)
    access_order: VecDeque<K>,
    timestamp: usize,
}

impl<K, V> LRUCache<K, V>
where
    K: Hash + Eq + Clone,
{
    pub fn new(capacity: usize) -> Self {
        LRUCache {
            capacity,
            cache: HashMap::with_capacity(capacity),
            access_order: VecDeque::with_capacity(capacity),
            timestamp: 0,
        }
    }

    pub fn get(&mut self, key: &K) -> Option<&V> {
        if let Some((value, _)) = self.cache.get(key) {
            // Update access order
            self.update_access_order(key.clone());
            Some(value)
        } else {
            None
        }
    }

    pub fn insert(&mut self, key: K, value: V) {
        if self.cache.contains_key(&key) {
            // Update existing entry
            self.cache.insert(key.clone(), (value, self.timestamp));
            self.update_access_order(key);
        } else {
            // Check if we need to evict
            if self.cache.len() >= self.capacity {
                self.evict_least_recently_used();
            }
            
            // Insert new entry
            self.cache.insert(key.clone(), (value, self.timestamp));
            self.access_order.push_back(key);
        }
        
        self.timestamp += 1;
    }

    pub fn remove(&mut self, key: &K) -> Option<V> {
        if let Some((value, _)) = self.cache.remove(key) {
            // Remove from access order
            if let Some(pos) = self.access_order.iter().position(|k| k == key) {
                self.access_order.remove(pos);
            }
            Some(value)
        } else {
            None
        }
    }

    pub fn contains_key(&self, key: &K) -> bool {
        self.cache.contains_key(key)
    }

    pub fn len(&self) -> usize {
        self.cache.len()
    }

    pub fn is_empty(&self) -> bool {
        self.cache.is_empty()
    }

    pub fn clear(&mut self) {
        self.cache.clear();
        self.access_order.clear();
        self.timestamp = 0;
    }

    fn update_access_order(&mut self, key: K) {
        // Remove old position
        if let Some(pos) = self.access_order.iter().position(|k| k == &key) {
            self.access_order.remove(pos);
        }
        // Add to end (most recently used)
        self.access_order.push_back(key);
    }

    fn evict_least_recently_used(&mut self) {
        if let Some(key) = self.access_order.pop_front() {
            self.cache.remove(&key);
        }
    }
}

// Memory page specific implementation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct PageKey {
    pub address: u64,
    pub size: usize,
}

pub struct PageCache {
    lru: LRUCache<PageKey, Box<[u8]>>,
}

impl PageCache {
    pub fn new(capacity: usize) -> Self {
        PageCache {
            lru: LRUCache::new(capacity),
        }
    }

    pub fn get_page(&mut self, address: u64, size: usize) -> Option<&[u8]> {
        let key = PageKey { address, size };
        self.lru.get(&key)
    }

    pub fn insert_page(&mut self, address: u64, size: usize, data: Box<[u8]>) {
        let key = PageKey { address, size };
        self.lru.insert(key, data);
    }

    pub fn remove_page(&mut self, address: u64, size: usize) -> Option<Box<[u8]>> {
        let key = PageKey { address, size };
        self.lru.remove(&key)
    }

    pub fn clear(&mut self) {
        self.lru.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lru_basic() {
        let mut cache = LRUCache::new(2);
        
        cache.insert(1, "one");
        cache.insert(2, "two");
        
        assert_eq!(cache.get(&1), Some(&"one"));
        assert_eq!(cache.get(&2), Some(&"two"));
        
        // This should evict "one" as it's the least recently used
        cache.insert(3, "three");
        assert_eq!(cache.get(&1), None);
        assert_eq!(cache.get(&2), Some(&"two"));
        assert_eq!(cache.get(&3), Some(&"three"));
    }

    #[test]
    fn test_page_cache() {
        let mut cache = PageCache::new(2);
        
        let data1 = Box::new([1, 2, 3, 4]);
        let data2 = Box::new([5, 6, 7, 8]);
        
        cache.insert_page(0x1000, 4, data1);
        cache.insert_page(0x2000, 4, data2);
        
        assert_eq!(cache.get_page(0x1000, 4), Some(&[1, 2, 3, 4][..]));
        assert_eq!(cache.get_page(0x2000, 4), Some(&[5, 6, 7, 8][..]));
        
        // This should evict the page at 0x1000
        let data3 = Box::new([9, 10, 11, 12]);
        cache.insert_page(0x3000, 4, data3);
        
        assert_eq!(cache.get_page(0x1000, 4), None);
        assert_eq!(cache.get_page(0x2000, 4), Some(&[5, 6, 7, 8][..]));
        assert_eq!(cache.get_page(0x3000, 4), Some(&[9, 10, 11, 12][..]));
    }
} 