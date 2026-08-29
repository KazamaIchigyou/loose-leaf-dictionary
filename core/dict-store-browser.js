/**
 * 浏览器端存储适配器：用 IndexedDB 持久化，内存缓存同步访问
 * 对应 Node.js 版 dict-store.js，在浏览器环境下运行
 *
 * 使用方法：
 *   await DictStore.ready();  // 启动时调用一次，等待数据加载
 *   // 之后所有 CRUD 操作都是同步的
 */
(function(global) {
    'use strict';

    var DB_NAME = 'dict_app_db';
    var DB_VERSION = 2;
    var LEGACY_KEY = 'dict_app_data';

    var _data = null;
    var _db = null;
    var _readyPromise = null;
    var _readyResolved = false;

    var STORE_NAMES = ['index', 'words', 'sentences', 'compounds', 'images'];

    function _openDB() {
        return new Promise(function(resolve, reject) {
            if (_db) { resolve(_db); return; }
            var request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = function(e) {
                var db = e.target.result;
                var tx = e.target.transaction;

                // 创建多表
                if (!db.objectStoreNames.contains('index')) {
                    db.createObjectStore('index', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('words')) {
                    db.createObjectStore('words', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('sentences')) {
                    db.createObjectStore('sentences', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('compounds')) {
                    db.createObjectStore('compounds', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('images')) {
                    db.createObjectStore('images', { keyPath: 'id' });
                }

                // 从旧版单 blob 迁移数据
                if (tx && tx.objectStoreNames.contains('app_data')) {
                    var oldStore = tx.objectStore('app_data');
                    var getReq = oldStore.get('main');
                    getReq.onsuccess = function() {
                        var oldData = getReq.result;
                        if (oldData && oldData.value) {
                            var data = oldData.value;
                            var idxStore = tx.objectStore('index');
                            var idxData = data.index || {};
                            if (data._data_version) { idxData._data_version = data._data_version; }
                            idxStore.put({ key: 'main', data: idxData });

                            if (data.words) {
                                var wStore = tx.objectStore('words');
                                for (var wid in data.words) {
                                    if (data.words.hasOwnProperty(wid)) {
                                        wStore.put({ id: wid, data: data.words[wid] });
                                    }
                                }
                            }
                            if (data.sentences) {
                                var sStore = tx.objectStore('sentences');
                                for (var sid in data.sentences) {
                                    if (data.sentences.hasOwnProperty(sid)) {
                                        sStore.put({ id: sid, data: data.sentences[sid] });
                                    }
                                }
                            }
                            if (data.compounds) {
                                var cStore = tx.objectStore('compounds');
                                for (var pid in data.compounds) {
                                    if (data.compounds.hasOwnProperty(pid)) {
                                        cStore.put({ id: pid, data: data.compounds[pid] });
                                    }
                                }
                            }
                            if (data.images) {
                                var iStore = tx.objectStore('images');
                                for (var imgId in data.images) {
                                    if (data.images.hasOwnProperty(imgId)) {
                                        iStore.put({ id: imgId, data: data.images[imgId] });
                                    }
                                }
                            }
                        }
                    };
                    db.deleteObjectStore('app_data');
                }
            };
            request.onsuccess = function(e) { _db = e.target.result; resolve(_db); };
            request.onerror = function(e) { reject(e.target.error); };
        });
    }

    function _getAllFromStore(storeName) {
        return _openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readonly');
                var store = tx.objectStore(storeName);
                var request = store.getAll();
                request.onsuccess = function() { resolve(request.result || []); };
                request.onerror = function() { reject(request.error); };
            });
        });
    }

    function _loadFromDB() {
        return _openDB().then(function(db) {
            var result = { index: null, words: {}, sentences: {}, compounds: {}, images: {} };
            var promises = STORE_NAMES.map(function(name) {
                return new Promise(function(resolve, reject) {
                    var tx = db.transaction(name, 'readonly');
                    var store = tx.objectStore(name);
                    var request = store.getAll();
                    request.onsuccess = function() {
                        var items = request.result || [];
                        if (name === 'index') {
                            for (var i = 0; i < items.length; i++) {
                                if (items[i].key === 'main') {
                                    result.index = items[i].data;
                                    break;
                                }
                            }
                        } else {
                            for (var i = 0; i < items.length; i++) {
                                result[name][items[i].id] = items[i].data;
                            }
                        }
                        resolve();
                    };
                    request.onerror = function() { reject(request.error); };
                });
            });
            return Promise.all(promises).then(function() { return result; });
        });
    }

    function _saveRecordToDB(storeName, id, data) {
        if (!_db) return Promise.resolve();
        return new Promise(function(resolve, reject) {
            try {
                var tx = _db.transaction(storeName, 'readwrite');
                var store = tx.objectStore(storeName);
                var req = store.put({ id: id, data: data });
                req.onsuccess = function() { resolve(); };
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function(e) { console.error('保存到 IndexedDB 失败:', e); reject(e); };
                tx.onabort = function(e) { console.error('保存事务中止:', e); reject(e); };
            } catch (e) {
                console.error('保存到 IndexedDB 失败:', e);
                reject(e);
            }
        });
    }

    function _saveIndexToDB() {
        if (!_db || !_data) return Promise.resolve();
        return new Promise(function(resolve, reject) {
            try {
                var tx = _db.transaction('index', 'readwrite');
                var store = tx.objectStore('index');
                store.put({ key: 'main', data: _data.index });
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function(e) { console.error('保存索引失败:', e); reject(e); };
                tx.onabort = function(e) { console.error('保存索引中止:', e); reject(e); };
            } catch (e) {
                console.error('保存索引到 IndexedDB 失败:', e);
                reject(e);
            }
        });
    }

    function _saveAllToDB() {
        if (!_db || !_data) return Promise.resolve();
        var promises = STORE_NAMES.map(function(name) {
            return new Promise(function(resolve, reject) {
                try {
                    var tx = _db.transaction(name, 'readwrite');
                    var store = tx.objectStore(name);
                    store.clear();
                    if (name === 'index') {
                        store.put({ key: 'main', data: _data.index });
                    } else {
                        var items = _data[name] || {};
                        for (var id in items) {
                            if (items.hasOwnProperty(id)) {
                                store.put({ id: id, data: items[id] });
                            }
                        }
                    }
                    tx.oncomplete = function() { resolve(); };
                    tx.onerror = function(e) { console.error('保存 ' + name + ' 失败:', e); reject(e); };
                    tx.onabort = function(e) { console.error('保存 ' + name + ' 中止:', e); reject(e); };
                } catch (e) {
                    console.error('保存 ' + name + ' 到 IndexedDB 失败:', e);
                    reject(e);
                }
            });
        });
        return Promise.all(promises);
    }

    function _loadFromLegacy() {
        try {
            var raw = localStorage.getItem(LEGACY_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                localStorage.removeItem(LEGACY_KEY);
                return parsed;
            }
        } catch (e) {
            console.error('读取旧存储失败:', e);
        }
        return null;
    }

    function _loadFromEmbedded() {
        var embedded = global.EMBEDDED_DATA;
        if (embedded) {
            return JSON.parse(JSON.stringify(embedded));
        }
        return null;
    }

    function _createEmptyData() {
        return {
            index: { base_units: [], compounds: [], unit_to_words: {}, next_cid: 1, next_pid: 1, next_word_id: 1, next_sentence_id: 1, image_index: {}, c2p: {} },
            words: {},
            sentences: {},
            compounds: {},
            images: {}
        };
    }

    function _normalizeData(data) {
        if (!data) return _createEmptyData();
        if (!data.index) data.index = {};
        if (!data.index.base_units) data.index.base_units = [];
        if (!data.index.compounds) data.index.compounds = [];
        if (!data.index.unit_to_words) data.index.unit_to_words = {};
        if (!data.index.image_index) data.index.image_index = {};
        if (!data.index.c2p) data.index.c2p = {};
        if (!data.words) data.words = {};
        if (!data.sentences) data.sentences = {};
        if (!data.compounds) data.compounds = {};
        if (!data.images) data.images = {};
        return data;
    }

    function _getEmbeddedVersion() {
        var embedded = global.EMBEDDED_DATA;
        return embedded ? (embedded._data_version || null) : null;
    }

    function _shouldReimportFromEmbedded(dbData) {
        var embeddedVersion = _getEmbeddedVersion();
        if (!embeddedVersion) return false;
        var storedVersion = dbData && dbData.index ? (dbData.index._data_version || null) : null;
        if (!storedVersion) return false;
        return storedVersion !== embeddedVersion;
    }

    function _dbHasAnyData(dbData) {
        if (!dbData) return false;
        if (dbData.index) return true;
        if (dbData.words && Object.keys(dbData.words).length > 0) return true;
        if (dbData.sentences && Object.keys(dbData.sentences).length > 0) return true;
        if (dbData.compounds && Object.keys(dbData.compounds).length > 0) return true;
        if (dbData.images && Object.keys(dbData.images).length > 0) return true;
        return false;
    }

    function _loadFromEmbeddedAndSave() {
        var embeddedData = _loadFromEmbedded();
        if (embeddedData) {
            _data = _normalizeData(embeddedData);
            return _saveAllToDB().then(function() { return true; });
        }
        return Promise.resolve(false);
    }

    function ready() {
        if (_readyResolved) return Promise.resolve();
        if (_readyPromise) return _readyPromise;

        _readyPromise = _loadFromDB().then(function(dbData) {
            if (_dbHasAnyData(dbData)) {
                if (_shouldReimportFromEmbedded(dbData)) {
                    console.log('data-embed.js 版本已更新，重新导入数据');
                    return _loadFromEmbeddedAndSave().then(function() {
                        _readyResolved = true;
                    });
                }
                _data = _normalizeData(dbData);
                if (!_data.index) _data.index = {};
                if (!_data.index.base_units) _data.index.base_units = [];
                if (!_data.index.compounds) _data.index.compounds = [];
                if (!_data.index.unit_to_words) _data.index.unit_to_words = {};
                if (!_data.index.image_index) _data.index.image_index = {};
                if (!_data.index.c2p) _data.index.c2p = {};
                _readyResolved = true;
                return;
            }

            var legacyData = _loadFromLegacy();
            if (legacyData) {
                _data = _normalizeData(legacyData);
                return _saveAllToDB().then(function() {
                    _readyResolved = true;
                });
            }

            return _loadFromEmbeddedAndSave().then(function(loaded) {
                if (loaded) {
                    _readyResolved = true;
                    return;
                }
                _data = _createEmptyData();
                return _saveAllToDB().then(function() {
                    _readyResolved = true;
                });
            });
        }).catch(function(err) {
            console.error('IndexedDB 加载失败，尝试旧存储:', err);
            var legacyData = _loadFromLegacy();
            if (legacyData) {
                _data = _normalizeData(legacyData);
                _readyResolved = true;
                return;
            }
            return _loadFromEmbeddedAndSave().then(function(loaded) {
                if (loaded) {
                    _readyResolved = true;
                    return;
                }
                _data = _createEmptyData();
                _readyResolved = true;
            });
        });

        return _readyPromise;
    }

    function initPaths() {}
    function ensureDirs() {
        if (_data) return true;
        try {
            var legacyData = _loadFromLegacy();
            if (legacyData) {
                _data = _normalizeData(legacyData);
                _saveAllToDB();
                return true;
            }
            var embeddedData = _loadFromEmbedded();
            if (embeddedData) {
                _data = _normalizeData(embeddedData);
                _saveAllToDB();
                return true;
            }
        } catch (e) {
            console.error('ensureDirs 回退加载失败:', e);
        }
        if (!_data) _data = _createEmptyData();
        return true;
    }

    function _ensureData() {
        if (_data) return true;
        return ensureDirs();
    }

    function loadJson(filepath) {
        _ensureData();
        if (filepath === '__index__') return _data.index;
        var store = null;
        var id = null;
        if (filepath.indexOf('__words__/') !== -1) {
            store = 'words';
            id = filepath.replace('__words__/', '');
        } else if (filepath.indexOf('/words/') !== -1) {
            store = 'words';
            id = filepath.split('/').pop().replace('.json', '');
        } else if (filepath.indexOf('__sentences__/') !== -1) {
            store = 'sentences';
            id = filepath.replace('__sentences__/', '');
        } else if (filepath.indexOf('/sentences/') !== -1) {
            store = 'sentences';
            id = filepath.split('/').pop().replace('.json', '');
        } else if (filepath.indexOf('__compounds__/') !== -1) {
            store = 'compounds';
            id = filepath.replace('__compounds__/', '');
        } else if (filepath.indexOf('/compounds/') !== -1) {
            store = 'compounds';
            id = filepath.split('/').pop().replace('.json', '');
        }
        if (store && id) return _data[store][id] || null;
        return null;
    }

    function saveJson(filepath, data) {
        _ensureData();
        if (filepath === '__index__') {
            _data.index = data;
            return _saveIndexToDB();
        } else {
            var store = null;
            var id = null;
            if (filepath.indexOf('__words__/') !== -1) {
                store = 'words';
                id = filepath.replace('__words__/', '');
            } else if (filepath.indexOf('/words/') !== -1) {
                store = 'words';
                id = filepath.split('/').pop().replace('.json', '');
            } else if (filepath.indexOf('__sentences__/') !== -1) {
                store = 'sentences';
                id = filepath.replace('__sentences__/', '');
            } else if (filepath.indexOf('/sentences/') !== -1) {
                store = 'sentences';
                id = filepath.split('/').pop().replace('.json', '');
            } else if (filepath.indexOf('__compounds__/') !== -1) {
                store = 'compounds';
                id = filepath.replace('__compounds__/', '');
            } else if (filepath.indexOf('/compounds/') !== -1) {
                store = 'compounds';
                id = filepath.split('/').pop().replace('.json', '');
            }
            if (store && id) {
                _data[store][id] = data;
                return _saveRecordToDB(store, id, data);
            }
            return Promise.resolve();
        }
    }

    function loadIndex() {
        _ensureData();
        if (!_data.index) {
            _data.index = { base_units: [], compounds: [], unit_to_words: {}, next_cid: 1, next_pid: 1, next_word_id: 1, next_sentence_id: 1, image_index: {}, c2p: {} };
        }
        if (!_data.index.image_index) _data.index.image_index = {};
        if (!_data.index.c2p) _data.index.c2p = {};
        if (!_data.index.unit_to_words) _data.index.unit_to_words = {};
        return _data.index;
    }

    function saveIndex(index) {
        _ensureData();
        _data.index = index;
        return _saveIndexToDB();
    }

    function loadWord(wid) { return loadJson('__words__/' + wid); }
    function saveWord(wid, data) { return saveJson('__words__/' + wid, data); }
    function loadSentence(sid) { return loadJson('__sentences__/' + sid); }
    function saveSentence(sid, data) { return saveJson('__sentences__/' + sid, data); }
    function loadCompound(pid) { return loadJson('__compounds__/' + pid); }
    function saveCompound(pid, data) { return saveJson('__compounds__/' + pid, data); }

    function _loadAllFromStore(store) {
        _ensureData();
        var items = {};
        for (var id in _data[store]) {
            if (_data[store].hasOwnProperty(id)) {
                items[id] = _data[store][id];
            }
        }
        return items;
    }

    function loadAllWords() { return _loadAllFromStore('words'); }
    function loadAllSentences() { return _loadAllFromStore('sentences'); }
    function loadAllCompounds() { return _loadAllFromStore('compounds'); }

    function loadWordTextToIdMap() {
        var mapping = {};
        var words = loadAllWords();
        for (var wid in words) {
            if (words.hasOwnProperty(wid)) {
                var text = words[wid].word;
                if (!mapping[text]) mapping[text] = [];
                mapping[text].push(wid);
            }
        }
        return mapping;
    }

    function buildCTextIndex() {
        var index = loadIndex();
        var cMap = {};
        var units = index.base_units || [];
        for (var i = 0; i < units.length; i++) cMap[units[i].text] = units[i];
        return cMap;
    }

    function buildPByClistIndex() {
        var index = loadIndex();
        var pMap = {};
        var compounds = index.compounds || [];
        for (var i = 0; i < compounds.length; i++) {
            var key = JSON.stringify(compounds[i].c_list);
            pMap[key] = compounds[i];
        }
        return pMap;
    }

    function loadImage(unitId) {
        _ensureData();
        return _data.images[unitId] || null;
    }

    function saveImage(unitId, data) {
        _ensureData();
        _data.images[unitId] = data;
        _data.index.image_index[unitId] = true;
        return Promise.all([
            _saveRecordToDB('images', unitId, data),
            _saveIndexToDB()
        ]);
    }

    function deleteImage(unitId) {
        _ensureData();
        if (_data.images[unitId]) {
            delete _data.images[unitId];
            delete _data.index.image_index[unitId];
            var deletePromise = Promise.resolve();
            if (_db) {
                deletePromise = new Promise(function(resolve, reject) {
                    try {
                        var tx = _db.transaction('images', 'readwrite');
                        var req = tx.objectStore('images').delete(unitId);
                        tx.oncomplete = function() { resolve(); };
                        tx.onerror = function(e) { reject(e); };
                        req.onerror = function(e) { reject(e); };
                    } catch (e) { reject(e); }
                });
            }
            return Promise.all([deletePromise, _saveIndexToDB()]);
        }
        return Promise.resolve();
    }

    function rebuildImageIndex() {
        _ensureData();
        var imageIndex = {};
        for (var id in _data.images) {
            if (_data.images.hasOwnProperty(id)) {
                imageIndex[id] = true;
            }
        }
        _data.index.image_index = imageIndex;
        return _saveIndexToDB();
    }

    function getImageIndex() {
        _ensureData();
        return _data.index.image_index || {};
    }

    function processNewImages() {
        _ensureData();
        var imageIndex = _data.index.image_index || {};
        var processed = 0;
        var skipped = 0;
        for (var id in _data.images) {
            if (_data.images.hasOwnProperty(id) && id.startsWith('n')) {
                var realId = id.slice(1);
                var valid = getAllValidUnitIds();
                if (valid[realId]) {
                    _data.images[realId] = _data.images[id];
                    delete _data.images[id];
                    imageIndex[realId] = true;
                    if (_db) {
                        try {
                            var tx = _db.transaction('images', 'readwrite');
                            tx.objectStore('images').delete(id);
                            tx.objectStore('images').put({ id: realId, data: _data.images[realId] });
                        } catch (e) {}
                    }
                    processed++;
                } else {
                    skipped++;
                }
            }
        }
        _data.index.image_index = imageIndex;
        _saveIndexToDB();
        return { success: true, processed: processed, skipped: skipped };
    }

    function getAllValidUnitIds() {
        _ensureData();
        var ids = {};
        var units = _data.index.base_units || [];
        for (var i = 0; i < units.length; i++) if (units[i].cid) ids[units[i].cid] = true;
        var compounds = _data.index.compounds || [];
        for (var j = 0; j < compounds.length; j++) if (compounds[j].pid) ids[compounds[j].pid] = true;
        for (var wid in _data.words) if (_data.words.hasOwnProperty(wid)) ids[wid] = true;
        for (var sid in _data.sentences) if (_data.sentences.hasOwnProperty(sid)) ids[sid] = true;
        return ids;
    }

    function _deleteFromDB(storeName, id) {
        if (!_db) return Promise.resolve();
        return new Promise(function(resolve, reject) {
            try {
                var tx = _db.transaction(storeName, 'readwrite');
                var req = tx.objectStore(storeName).delete(id);
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function(e) { reject(e); };
                req.onerror = function(e) { reject(e); };
            } catch (e) { reject(e); }
        });
    }

    function deleteWord(wid) {
        _ensureData();
        if (_data.words[wid]) {
            delete _data.words[wid];
            return _deleteFromDB('words', wid);
        }
        return Promise.resolve();
    }

    function deleteCompound(pid) {
        _ensureData();
        if (_data.compounds[pid]) {
            delete _data.compounds[pid];
            return _deleteFromDB('compounds', pid);
        }
        return Promise.resolve();
    }

    function deleteSentence(sid) {
        _ensureData();
        if (_data.sentences[sid]) {
            delete _data.sentences[sid];
            return _deleteFromDB('sentences', sid);
        }
        return Promise.resolve();
    }

    function reset() {
        if (_db) {
            try {
                STORE_NAMES.forEach(function(name) {
                    var tx = _db.transaction(name, 'readwrite');
                    tx.objectStore(name).clear();
                });
            } catch (e) {
                console.error('清除 IndexedDB 失败:', e);
            }
        }
        try { localStorage.removeItem(LEGACY_KEY); } catch (e) {}
        _data = null;
        _ensureData();
    }

    function exportData() {
        _ensureData();
        return JSON.parse(JSON.stringify(_data));
    }

    function importData(jsonStr) {
        _data = JSON.parse(jsonStr);
        return _saveAllToDB();
    }

    var DictStoreBrowser = {
        ready: ready,
        initPaths: initPaths,
        ensureDirs: ensureDirs,
        loadJson: loadJson,
        saveJson: saveJson,
        loadIndex: loadIndex,
        saveIndex: saveIndex,
        loadWord: loadWord,
        saveWord: saveWord,
        loadSentence: loadSentence,
        saveSentence: saveSentence,
        loadCompound: loadCompound,
        saveCompound: saveCompound,
        loadAllWords: loadAllWords,
        loadAllSentences: loadAllSentences,
        loadAllCompounds: loadAllCompounds,
        loadWordTextToIdMap: loadWordTextToIdMap,
        buildCTextIndex: buildCTextIndex,
        buildPByClistIndex: buildPByClistIndex,
        loadImage: loadImage,
        saveImage: saveImage,
        deleteImage: deleteImage,
        rebuildImageIndex: rebuildImageIndex,
        getImageIndex: getImageIndex,
        processNewImages: processNewImages,
        getAllValidUnitIds: getAllValidUnitIds,
        deleteWord: deleteWord,
        deleteCompound: deleteCompound,
        deleteSentence: deleteSentence,
        reset: reset,
        exportData: exportData,
        importData: importData,
        DATA_DIR: '',
        WORDS_DIR: '',
        SENTENCES_DIR: '',
        COMPOUNDS_DIR: '',
        IMAGES_DIR: '',
        INDEX_FILE: ''
    };

    global.DictStore = DictStoreBrowser;
})(typeof window !== 'undefined' ? window : globalThis);