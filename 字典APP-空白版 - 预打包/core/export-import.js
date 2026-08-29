(function(global) {
    'use strict';

    var DictStore = global.DictStore;

    // ========== CRC32 ==========
    var CRC_TABLE = new Uint32Array(256);
    for (var _n = 0; _n < 256; _n++) {
        var _c = _n;
        for (var _k = 0; _k < 8; _k++) {
            _c = (_c & 1) ? (0xEDB88320 ^ (_c >>> 1)) : (_c >>> 1);
        }
        CRC_TABLE[_n] = _c >>> 0;
    }

    function crc32(bytes) {
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < bytes.length; i++) {
            crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    // ========== 编码转换 ==========
    function stringToBytes(str) {
        return new TextEncoder().encode(str);
    }

    function bytesToString(bytes) {
        return new TextDecoder().decode(bytes);
    }

    function base64ToBytes(b64) {
        var binary = atob(b64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function bytesToBase64(bytes) {
        var binary = '';
        var CHUNK = 0x8000;
        for (var i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(binary);
    }

    function dataUrlToBytes(dataUrl) {
        var commaIdx = dataUrl.indexOf(',');
        if (commaIdx === -1) throw new Error('无效的 data URL');
        var meta = dataUrl.substring(5, commaIdx);
        var isBase64 = meta.indexOf('base64') !== -1;
        var data = dataUrl.substring(commaIdx + 1);
        if (isBase64) return base64ToBytes(data);
        return stringToBytes(decodeURIComponent(data));
    }

    function bytesToDataUrl(bytes, mime) {
        if (!mime) mime = 'image/png';
        return 'data:' + mime + ';base64,' + bytesToBase64(bytes);
    }

    // ========== ZIP Builder ==========
    function dosDateTime(date) {
        var time = 0;
        time |= (date.getHours() & 0x1F) << 11;
        time |= (date.getMinutes() & 0x3F) << 5;
        time |= (date.getSeconds() / 2) & 0x1F;
        var d = 0;
        d |= ((date.getFullYear() - 1980) & 0x7F) << 9;
        d |= ((date.getMonth() + 1) & 0x0F) << 5;
        d |= (date.getDate() & 0x1F);
        return { time: time, date: d };
    }

    function createZip(files) {
        var parts = [];
        var centralDir = [];
        var offset = 0;
        var now = new Date();
        var ddt = dosDateTime(now);

        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            var nameBytes = stringToBytes(file.path);
            var nameLen = nameBytes.length;
            var data = file.data;
            var dataLen = data.length;
            var crc = crc32(data);

            var header = new Uint8Array(30 + nameLen);
            var hv = new DataView(header.buffer);
            hv.setUint32(0, 0x04034b50, true);
            hv.setUint16(4, 20, true);
            hv.setUint16(6, 0x0800, true);
            hv.setUint16(8, 0, true);
            hv.setUint16(10, ddt.time, true);
            hv.setUint16(12, ddt.date, true);
            hv.setUint32(14, crc, true);
            hv.setUint32(18, dataLen, true);
            hv.setUint32(22, dataLen, true);
            hv.setUint16(26, nameLen, true);
            hv.setUint16(28, 0, true);
            for (var j = 0; j < nameLen; j++) header[30 + j] = nameBytes[j];

            parts.push(header);
            parts.push(data);

            var cd = new Uint8Array(46 + nameLen);
            var cdv = new DataView(cd.buffer);
            cdv.setUint32(0, 0x02014b50, true);
            cdv.setUint16(4, 20, true);
            cdv.setUint16(6, 20, true);
            cdv.setUint16(8, 0x0800, true);
            cdv.setUint16(10, 0, true);
            cdv.setUint16(12, ddt.time, true);
            cdv.setUint16(14, ddt.date, true);
            cdv.setUint32(16, crc, true);
            cdv.setUint32(20, dataLen, true);
            cdv.setUint32(24, dataLen, true);
            cdv.setUint16(28, nameLen, true);
            cdv.setUint16(30, 0, true);
            cdv.setUint16(32, 0, true);
            cdv.setUint16(34, 0, true);
            cdv.setUint16(36, 0, true);
            cdv.setUint32(38, 0, true);
            cdv.setUint32(42, offset, true);
            for (var j = 0; j < nameLen; j++) cd[46 + j] = nameBytes[j];

            centralDir.push(cd);
            offset += header.length + dataLen;
        }

        var cdSize = 0;
        for (var k = 0; k < centralDir.length; k++) cdSize += centralDir[k].length;

        var endRecord = new Uint8Array(22);
        var endView = new DataView(endRecord.buffer);
        endView.setUint32(0, 0x06054b50, true);
        endView.setUint16(4, 0, true);
        endView.setUint16(6, 0, true);
        endView.setUint16(8, files.length, true);
        endView.setUint16(10, files.length, true);
        endView.setUint32(12, cdSize, true);
        endView.setUint32(16, offset, true);
        endView.setUint16(20, 0, true);

        var allParts = parts.concat(centralDir, [endRecord]);
        return new Blob(allParts, { type: 'application/zip' });
    }

    // ========== Decompress helper ==========
    function _inflateRaw(compressedBytes) {
        return new Promise(function(resolve, reject) {
            try {
                if (typeof DecompressionStream === 'undefined') {
                    reject(new Error('当前浏览器不支持 DEFLATE 解压，请使用 7-Zip 将 ZIP 设为「存储」压缩级别后再导入'));
                    return;
                }
                var ds = new DecompressionStream('deflate-raw');
                var blob = new Blob([compressedBytes], { type: 'application/octet-stream' });
                var stream = blob.stream().pipeThrough(ds);
                new Response(stream).arrayBuffer().then(function(buf) {
                    resolve(new Uint8Array(buf));
                }).catch(reject);
            } catch (e) {
                reject(e);
            }
        });
    }

    // ========== ZIP Parser ==========
    function parseZip(blob) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) {
                try {
                    var buffer = e.target.result;
                    var view = new DataView(buffer);
                    var totalLen = buffer.byteLength;

                    var endRecordOffset = -1;
                    var searchStart = Math.max(0, totalLen - 65558);
                    for (var i = totalLen - 22; i >= searchStart; i--) {
                        if (view.getUint32(i, true) === 0x06054b50) {
                            endRecordOffset = i;
                            break;
                        }
                    }

                    if (endRecordOffset === -1) {
                        reject(new Error('无效的 ZIP 文件：找不到结束记录'));
                        return;
                    }

                    var endView = new DataView(buffer, endRecordOffset);
                    var numEntries = endView.getUint16(8, true);
                    var cdOffset = endView.getUint32(16, true);

                    if (numEntries === 0) {
                        resolve([]);
                        return;
                    }

                    var cdPos = cdOffset;
                    var entries = [];

                    for (var idx = 0; idx < numEntries; idx++) {
                        if (cdPos + 46 > totalLen) break;

                        var sig = view.getUint32(cdPos, true);
                        if (sig !== 0x02014b50) {
                            reject(new Error('无效的 ZIP 中心目录签名'));
                            return;
                        }

                        var nameLen = view.getUint16(cdPos + 28, true);
                        var extraLen = view.getUint16(cdPos + 30, true);
                        var commentLen = view.getUint16(cdPos + 32, true);
                        var compressionMethod = view.getUint16(cdPos + 10, true);
                        var compSize = view.getUint32(cdPos + 20, true);
                        var uncompSize = view.getUint32(cdPos + 24, true);
                        var localOffset = view.getUint32(cdPos + 42, true);

                        var nameBytes = new Uint8Array(buffer, cdPos + 46, nameLen);
                        var name = bytesToString(nameBytes);

                        var localSig = view.getUint32(localOffset, true);
                        if (localSig !== 0x04034b50) {
                            reject(new Error('无效的 ZIP 本地文件头: ' + name));
                            return;
                        }

                        var localNameLen = view.getUint16(localOffset + 26, true);
                        var localExtraLen = view.getUint16(localOffset + 28, true);
                        var dataStart = localOffset + 30 + localNameLen + localExtraLen;

                        entries.push({
                            path: name,
                            method: compressionMethod,
                            dataStart: dataStart,
                            compSize: compSize,
                            uncompSize: uncompSize
                        });

                        cdPos += 46 + nameLen + extraLen + commentLen;
                    }

                    var filePromises = entries.map(function(entry) {
                        if (entry.uncompSize === 0 && entry.compSize === 0) {
                            return Promise.resolve({ path: entry.path, data: new Uint8Array(0) });
                        }

                        if (entry.method === 0) {
                            var data = new Uint8Array(buffer, entry.dataStart, entry.uncompSize);
                            return Promise.resolve({ path: entry.path, data: data });
                        }

                        if (entry.method === 8) {
                            var raw = new Uint8Array(buffer, entry.dataStart, entry.compSize);
                            return _inflateRaw(raw).then(function(decompressed) {
                                return { path: entry.path, data: decompressed };
                            }).catch(function(err) {
                                throw new Error('解压文件失败 ' + entry.path + ': ' + err.message);
                            });
                        }

                        return Promise.reject(new Error(
                            '不支持的 ZIP 压缩方式（method=' + entry.method + '）：' + entry.path +
                            '，请使用 7-Zip 将 ZIP 设为「存储(Store)」压缩级别后再导入'
                        ));
                    });

                    Promise.all(filePromises).then(function(files) {
                        resolve(files);
                    }).catch(reject);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = function() {
                reject(new Error('读取文件失败'));
            };
            reader.readAsArrayBuffer(blob);
        });
    }

    // ========== Export ==========
    function exportToZip() {
        var index = DictStore.loadIndex();
        var words = DictStore.loadAllWords();
        var compounds = DictStore.loadAllCompounds();
        var sentences = DictStore.loadAllSentences();
        var imageIndex = DictStore.getImageIndex();

        var files = [];

        files.push({
            path: 'data/index.json',
            data: stringToBytes(JSON.stringify(index, null, 2))
        });

        for (var wid in words) {
            if (words.hasOwnProperty(wid)) {
                files.push({
                    path: 'data/words/' + wid + '.json',
                    data: stringToBytes(JSON.stringify(words[wid], null, 2))
                });
            }
        }

        for (var pid in compounds) {
            if (compounds.hasOwnProperty(pid)) {
                files.push({
                    path: 'data/compounds/' + pid + '.json',
                    data: stringToBytes(JSON.stringify(compounds[pid], null, 2))
                });
            }
        }

        for (var sid in sentences) {
            if (sentences.hasOwnProperty(sid)) {
                files.push({
                    path: 'data/sentences/' + sid + '.json',
                    data: stringToBytes(JSON.stringify(sentences[sid], null, 2))
                });
            }
        }

        for (var imgId in imageIndex) {
            if (imageIndex.hasOwnProperty(imgId)) {
                var dataUrl = DictStore.loadImage(imgId);
                if (dataUrl) {
                    try {
                        var imgBytes = dataUrlToBytes(dataUrl);
                        files.push({
                            path: 'data/images/' + imgId + '.png',
                            data: imgBytes
                        });
                    } catch (e) {
                        console.warn('跳过图片 ' + imgId + ': ' + e.message);
                    }
                }
            }
        }

        var stats = global.DictApp ? global.DictApp.getStats() : {};
        var manifest = {
            version: 1,
            app: '电子活页字典',
            exportTime: new Date().toISOString(),
            stats: stats
        };
        files.push({
            path: 'manifest.json',
            data: stringToBytes(JSON.stringify(manifest, null, 2))
        });

        return createZip(files);
    }

    function triggerDownload(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }

    function downloadExport() {
        var blob = exportToZip();
        var ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        triggerDownload(blob, 'dict-export-' + ts + '.zip');
        return { success: true, filename: 'dict-export-' + ts + '.zip' };
    }

    // ========== Import ==========
    function importFromZip(blob, mode) {
        if (!mode) mode = 'merge';
        return parseZip(blob).then(function(files) {
            var wordsToSave = {};
            var compoundsToSave = {};
            var sentencesToSave = {};
            var imagesToSave = {};
            var indexToSave = null;

            for (var i = 0; i < files.length; i++) {
                var file = files[i];
                var p = file.path;

                if (p === 'data/index.json') {
                    indexToSave = JSON.parse(bytesToString(file.data));
                } else if (p.indexOf('data/words/') === 0 && p.endsWith('.json')) {
                    var wid = p.slice(p.lastIndexOf('/') + 1, -5);
                    wordsToSave[wid] = JSON.parse(bytesToString(file.data));
                } else if (p.indexOf('data/compounds/') === 0 && p.endsWith('.json')) {
                    var pid = p.slice(p.lastIndexOf('/') + 1, -5);
                    compoundsToSave[pid] = JSON.parse(bytesToString(file.data));
                } else if (p.indexOf('data/sentences/') === 0 && p.endsWith('.json')) {
                    var sid = p.slice(p.lastIndexOf('/') + 1, -5);
                    sentencesToSave[sid] = JSON.parse(bytesToString(file.data));
                } else if (p.indexOf('data/images/') === 0 && p.endsWith('.png')) {
                    var imgId = p.slice(p.lastIndexOf('/') + 1, -4);
                    imagesToSave[imgId] = bytesToDataUrl(file.data, 'image/png');
                }
            }

            if (!indexToSave) {
                throw new Error('ZIP 中未找到 data/index.json，不是有效的字典备份');
            }

            var saveSteps = [];

            if (mode === 'replace') {
                DictStore.reset();
            }

            var idxPromise = DictStore.saveIndex(indexToSave);
            saveSteps.push(idxPromise);

            for (var w in wordsToSave) {
                if (wordsToSave.hasOwnProperty(w)) {
                    saveSteps.push(DictStore.saveWord(w, wordsToSave[w]));
                }
            }
            for (var c in compoundsToSave) {
                if (compoundsToSave.hasOwnProperty(c)) {
                    saveSteps.push(DictStore.saveCompound(c, compoundsToSave[c]));
                }
            }
            for (var s in sentencesToSave) {
                if (sentencesToSave.hasOwnProperty(s)) {
                    saveSteps.push(DictStore.saveSentence(s, sentencesToSave[s]));
                }
            }
            for (var img in imagesToSave) {
                if (imagesToSave.hasOwnProperty(img)) {
                    saveSteps.push(DictStore.saveImage(img, imagesToSave[img]));
                }
            }

            saveSteps.push(Promise.resolve().then(function() {
                DictStore.rebuildImageIndex();
            }));

            return Promise.all(saveSteps).then(function() {
                return {
                    success: true,
                    mode: mode,
                    words: Object.keys(wordsToSave).length,
                    compounds: Object.keys(compoundsToSave).length,
                    sentences: Object.keys(sentencesToSave).length,
                    images: Object.keys(imagesToSave).length
                };
            });
        });
    }

    function handleImportFile(file, mode) {
        return importFromZip(file, mode).then(function(result) {
            if (global.DictApp && global.DictApp.refreshAll) {
                global.DictApp.refreshAll();
            }
            return result;
        });
    }

    global.ExportImport = {
        exportToZip: exportToZip,
        downloadExport: downloadExport,
        importFromZip: importFromZip,
        handleImportFile: handleImportFile
    };

})(typeof window !== 'undefined' ? window : globalThis);