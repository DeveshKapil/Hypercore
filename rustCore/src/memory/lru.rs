use core::hash::Hash;
use alloc::collections::BTreeMap;
use alloc::collections::VecDeque;
use alloc::boxed::Box;

pub struct LRUCache<K, V> {
    cache: BTreeMap<K, (V, usize)>,
    order: VecDeque<K>,
    capacity: usize,
}

impl<K: Clone + Eq + Hash + Ord, V> LRUCache<K, V> {
    pub fn new(capacity: usize) -> Self {
        LRUCache {
            cache: BTreeMap::new(),
            order: VecDeque::with_capacity(capacity),
            capacity,
        }
    }

    pub fn get(&mut self, key: &K) -> Option<&V> {
        // First, get the value (immutable borrow)
        let value = self.cache.get(key).map(|(v, _)| v);
        // Then, if it exists, update access order (mutable borrow)
        if value.is_some() {
            self.update_access_order(key.clone());
        }
        value
    }

    pub fn insert(&mut self, key: K, value: V) {
        if self.cache.len() >= self.capacity {
            if let Some(old_key) = self.order.pop_front() {
                self.cache.remove(&old_key);
            }
        }
        self.cache.insert(key.clone(), (value, self.order.len()));
        self.order.push_back(key);
    }

    pub fn remove(&mut self, key: &K) -> Option<V> {
        if let Some((value, _)) = self.cache.remove(key) {
            // Remove from access order
            if let Some(pos) = self.order.iter().position(|k| k == key) {
                self.order.remove(pos);
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
        self.order.clear();
    }

    fn update_access_order(&mut self, key: K) {
        // Remove old position
        if let Some(pos) = self.order.iter().position(|k| k == &key) {
            self.order.remove(pos);
        }
        // Add to end (most recently used)
        self.order.push_back(key);
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
        self.lru.get(&key).map(|v| &**v)
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