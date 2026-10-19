/* IndexedDB cache of the encrypted portfolio (and attachment blobs) so the app opens offline. */
(function (g) {
  'use strict';
  function openDb() {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open('pt-cache', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  async function put(key, value) {
    const db = await openDb();
    await new Promise(function (resolve, reject) {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = function () { reject(tx.error); };
    });
    db.close();
  }
  async function get(key) {
    const db = await openDb();
    const value = await new Promise(function (resolve, reject) {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(key);
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    db.close();
    return value;
  }
  async function del(key) {
    const db = await openDb();
    await new Promise(function (resolve, reject) {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete(key);
      tx.oncomplete = resolve;
      tx.onerror = function () { reject(tx.error); };
    });
    db.close();
  }
  async function clear() {
    const db = await openDb();
    await new Promise(function (resolve, reject) {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').clear();
      tx.oncomplete = resolve;
      tx.onerror = function () { reject(tx.error); };
    });
    db.close();
  }
  g.PTCache = { put: put, get: get, del: del, clear: clear };
})(typeof globalThis !== 'undefined' ? globalThis : this);
