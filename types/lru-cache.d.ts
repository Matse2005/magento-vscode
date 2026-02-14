declare module 'lru-cache' {
  export = LRUCache;
  declare class LRUCache<K = any, V = any> extends Map<K, V> {
    entries(): MapIterator<[K, V]>;
    keys(): MapIterator<K>;
    values(): MapIterator<V>;
    [Symbol.iterator](): MapIterator<[K, V]>;
  }
}