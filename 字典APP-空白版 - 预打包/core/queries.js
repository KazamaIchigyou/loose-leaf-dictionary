/**
 * 查询层：浏览、检索、展示相关功能
 * 对应 Python 版 routes/query_routes.py + routes/view_routes.py
 */
(function(global) {
    'use strict';

    var DictStore = (typeof module !== 'undefined' && module.exports)
        ? require('./dict-store')
        : global.DictStore;

    function _naturalSortKey(s) {
        var parts = s.split(/(\d+)/);
        var result = [];
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (/^\d+$/.test(p)) {
                result.push(parseInt(p, 10));
            } else {
                result.push(p.toLowerCase());
            }
        }
        return result;
    }

    function _buildIdToInfo(index) {
        var cTextMap = {};
        var units = index.base_units || [];
        for (var i = 0; i < units.length; i++) {
            cTextMap[units[i].cid] = units[i].text;
        }
        var idToInfo = {};
        for (var j = 0; j < units.length; j++) {
            idToInfo[units[j].cid] = { text: units[j].text, is_compound: false, id: units[j].cid };
        }
        var compounds = index.compounds || [];
        for (var k = 0; k < compounds.length; k++) {
            var comp = compounds[k];
            var cParts = [];
            var cList = comp.c_list || [];
            for (var ci = 0; ci < cList.length; ci++) {
                cParts.push(cTextMap[cList[ci]] || '?');
            }
            idToInfo[comp.pid] = { text: comp.text, is_compound: true, body_text: cParts.join('_'), id: comp.pid };
        }
        return idToInfo;
    }

    function getAllWords() {
        var index = DictStore.loadIndex();
        var imageIndex = DictStore.getImageIndex();
        var idToInfo = _buildIdToInfo(index);
        var wordsList = [];
        var allWords = DictStore.loadAllWords();

        for (var wid in allWords) {
            if (allWords.hasOwnProperty(wid)) {
                var wdata = allWords[wid];
                var cList = wdata.c_list || [];
                var cTexts = [];
                for (var i = 0; i < cList.length; i++) {
                    var info = idToInfo[cList[i]];
                    cTexts.push(info || { text: '?', is_compound: false });
                }
                wordsList.push({
                    wid: wid,
                    word: wdata.word,
                    meaning_seq: wdata.meaning_seq || 1,
                    desc: wdata.desc || '',
                    c_texts: cTexts,
                    has_image: !!imageIndex[wid]
                });
            }
        }
        wordsList.sort(function(a, b) {
            var ka = _naturalSortKey(a.word);
            var kb = _naturalSortKey(b.word);
            return _compareNatural(ka, kb);
        });
        return { words: wordsList };
    }

    function _compareNatural(a, b) {
        var len = Math.min(a.length, b.length);
        for (var i = 0; i < len; i++) {
            if (a[i] < b[i]) return -1;
            if (a[i] > b[i]) return 1;
        }
        return a.length - b.length;
    }

    function getAllSentences() {
        var sentencesList = [];
        var allSentences = DictStore.loadAllSentences();
        var allWords = DictStore.loadAllWords();

        for (var sid in allSentences) {
            if (allSentences.hasOwnProperty(sid)) {
                var sdata = allSentences[sid];
                var words = sdata.words || [];
                var punct = sdata.punct || [];
                var punctMap = {};
                punct.forEach(function(p) { punctMap[p.idx] = p.tail; });

                var previewParts = [];
                for (var i = 0; i < words.length; i++) {
                    var w = words[i];
                    var wd = null;
                    var previewWord;
                    if (typeof w === 'string') {
                        wd = allWords[w];
                        previewWord = wd ? wd.word : '[' + w + ']';
                    } else if (typeof w === 'object' && w !== null && w.c_list) {
                        var parts = [];
                        for (var ci = 0; ci < w.c_list.length; ci++) {
                            var cpid = w.c_list[ci];
                            var unit = getSingleUnit(cpid);
                            if (!unit.error) {
                                parts.push(unit.text);
                            } else {
                                var comp = getSingleCompound(cpid);
                                parts.push(comp.error ? '?' : comp.text);
                            }
                        }
                        previewWord = parts.join('');
                    } else {
                        previewWord = '[?]';
                    }
                    previewParts.push(previewWord);
                    if (punctMap[i + 1] !== undefined) {
                        previewParts.push(punctMap[i + 1]);
                    }
                }

                sentencesList.push({
                    sid: sid,
                    words: words,
                    punct: punct,
                    desc: sdata.desc || '',
                    preview: previewParts.join(' ')
                });
            }
        }
        sentencesList.sort(function(a, b) {
            return _compareNatural(_naturalSortKey(a.sid), _naturalSortKey(b.sid));
        });
        return { sentences: sentencesList };
    }

    function getAllUnits() {
        var index = DictStore.loadIndex();
        var imageIndex = DictStore.getImageIndex();
        var unitsList = [];
        var units = index.base_units || [];
        for (var i = 0; i < units.length; i++) {
            unitsList.push({
                cid: units[i].cid,
                text: units[i].text,
                desc: units[i].desc || '',
                has_image: !!imageIndex[units[i].cid]
            });
        }
        unitsList.sort(function(a, b) {
            return _compareNatural(_naturalSortKey(a.cid), _naturalSortKey(b.cid));
        });
        return { units: unitsList };
    }

    function getAllCompounds() {
        var index = DictStore.loadIndex();
        var imageIndex = DictStore.getImageIndex();
        var cTextMap = {};
        var units = index.base_units || [];
        for (var i = 0; i < units.length; i++) {
            cTextMap[units[i].cid] = units[i].text;
        }

        var compoundsList = [];
        var compounds = index.compounds || [];
        for (var j = 0; j < compounds.length; j++) {
            var comp = compounds[j];
            var cParts = [];
            var cList = comp.c_list || [];
            for (var ci = 0; ci < cList.length; ci++) {
                cParts.push(cTextMap[cList[ci]] || '?');
            }
            compoundsList.push({
                pid: comp.pid,
                text: comp.text,
                c_list: comp.c_list || [],
                body_text: cParts.join('_'),
                desc: comp.desc || '',
                has_image: !!imageIndex[comp.pid]
            });
        }
        compoundsList.sort(function(a, b) {
            return _compareNatural(_naturalSortKey(a.pid), _naturalSortKey(b.pid));
        });
        return { compounds: compoundsList };
    }

    function _resolveWordRef(w) {
        if (typeof w === 'object' && w !== null) {
            return w.c_list || null;
        }
        if (typeof w === 'string' && w.charAt(0) === '[') {
            try { return JSON.parse(w); } catch(e) {}
        }
        return null;
    }

    function getSingleSentence(sid) {
        var sdata = DictStore.loadSentence(sid);
        if (!sdata) return { error: '句子 ' + sid + ' 不存在' };
        var allWords = DictStore.loadAllWords();
        var words = sdata.words || [];
        var punct = sdata.punct || [];
        var punctMap = {};
        punct.forEach(function(p) { punctMap[p.idx] = p.tail; });

        var previewParts = [];
        var bodyParts = [];
        var bodyPunctMap = {};
        for (var pi = 0; pi < punct.length; pi++) {
            bodyPunctMap[punct[pi].idx] = punct[pi].tail;
        }
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            var wid = typeof w === 'string' ? w : null;
            var wd = wid ? allWords[wid] : null;
            var previewWord, bodyWord;
            if (wd) {
                previewWord = wd.word;
                // body格式：展开C/P组成
                var wCList = wd.c_list || [];
                if (wCList.length > 0) {
                    var wParts = [];
                    for (var wi = 0; wi < wCList.length; wi++) {
                        var cpid2 = wCList[wi];
                        var unit2 = getSingleUnit(cpid2);
                        if (!unit2.error) {
                            wParts.push(unit2.text);
                        } else {
                            var comp2 = getSingleCompound(cpid2);
                            if (!comp2.error && comp2.c_list) {
                                var cParts2 = comp2.c_list.map(function(cid) {
                                    var u2 = getSingleUnit(cid);
                                    return u2.error ? '?' : u2.text;
                                });
                                wParts.push(cParts2.join('_'));
                            } else {
                                wParts.push('?');
                            }
                        }
                    }
                    bodyWord = wParts.join('/');
                } else {
                    bodyWord = wd.word;
                }
            } else {
                var cList = _resolveWordRef(w);
                if (cList) {
                    var parts = [];
                    for (var ci = 0; ci < cList.length; ci++) {
                        var cpid = cList[ci];
                        var unit = getSingleUnit(cpid);
                        if (!unit.error) {
                            parts.push(unit.text);
                        } else {
                            var comp = getSingleCompound(cpid);
                            parts.push(comp.error ? '?' : comp.text);
                        }
                    }
                    previewWord = parts.join('');
                    bodyWord = parts.join('/');
                } else {
                    var unit = wid ? getSingleUnit(wid) : { error: true };
                    if (!unit.error) {
                        previewWord = unit.text;
                        bodyWord = unit.text;
                    } else {
                        var comp = wid ? getSingleCompound(wid) : { error: true };
                        previewWord = comp.error ? '[' + (wid || '?') + ']' : comp.text;
                        bodyWord = comp.error ? '[' + (wid || '?') + ']' : comp.text;
                    }
                }
            }
            previewParts.push(previewWord);
            bodyParts.push(bodyWord);
            if (punctMap[i + 1] !== undefined) {
                previewParts.push(punctMap[i + 1]);
            }
            if (bodyPunctMap[i + 1] !== undefined) {
                bodyParts.push(bodyPunctMap[i + 1]);
            }
        }
        var preview = previewParts.join(' ');
        var body_text = bodyParts.join('+');

        return {
            id: sid,
            sid: sid,
            words: words,
            punct: punct,
            desc: sdata.desc || '',
            preview: preview,
            body_text: body_text
        };
    }

    function getSingleWord(wid) {
        var wdata = DictStore.loadWord(wid);
        if (!wdata) return { error: '单词 ' + wid + ' 不存在' };
        var index = DictStore.loadIndex();
        var idToInfo = _buildIdToInfo(index);
        var cList = wdata.c_list || [];
        var cTexts = [];
        var bodyParts = [];
        for (var i = 0; i < cList.length; i++) {
            var info = idToInfo[cList[i]] || { text: '?', is_compound: false };
            cTexts.push(info);
            bodyParts.push(info.is_compound ? info.body_text : info.text);
        }
        return {
            wid: wid,
            word: wdata.word,
            meaning_seq: wdata.meaning_seq || 1,
            desc: wdata.desc || '',
            c_list: cList,
            c_texts: cTexts,
            all_sentences: wdata.all_sentences || [],
            body_text: bodyParts.join('/')
        };
    }

    function getSingleCompound(pid) {
        var cdata = DictStore.loadCompound(pid);
        if (!cdata) return { error: '复合字根 ' + pid + ' 不存在' };
        var index = DictStore.loadIndex();
        var cTextMap = {};
        var units = index.base_units || [];
        for (var i = 0; i < units.length; i++) {
            cTextMap[units[i].cid] = units[i].text;
        }
        var cParts = [];
        var cList = cdata.c_list || [];
        for (var ci = 0; ci < cList.length; ci++) {
            cParts.push(cTextMap[cList[ci]] || '?');
        }
        var refWids = (index.unit_to_words && index.unit_to_words[pid]) || [];
        return {
            pid: pid,
            text: cdata.text,
            c_list: cList,
            body_text: cParts.join('_'),
            desc: cdata.desc || '',
            ref_words: refWids
        };
    }

    function getSingleUnit(cid) {
        var index = DictStore.loadIndex();
        var units = index.base_units || [];
        for (var i = 0; i < units.length; i++) {
            if (units[i].cid === cid) {
                var refPids = (index.c2p && index.c2p[cid]) || [];
                var refWids = [];
                for (var j = 0; j < refPids.length; j++) {
                    var wids = (index.unit_to_words && index.unit_to_words[refPids[j]]) || [];
                    for (var k = 0; k < wids.length; k++) {
                        if (refWids.indexOf(wids[k]) === -1) refWids.push(wids[k]);
                    }
                }
                return {
                    cid: units[i].cid,
                    text: units[i].text,
                    desc: units[i].desc || '',
                    ref_compounds: refPids,
                    ref_words: refWids
                };
            }
        }
        return { error: '基础字根 ' + cid + ' 不存在' };
    }

    function getWordDetail(wid) {
        return getSingleWord(wid);
    }

    function checkDuplicates() {
        var duplicateWords = [];
        var wordsByCList = {};
        var allWords = DictStore.loadAllWords();

        for (var wid in allWords) {
            if (allWords.hasOwnProperty(wid)) {
                var wdata = allWords[wid];
                var key = JSON.stringify(wdata.c_list);
                if (!wordsByCList[key]) wordsByCList[key] = [];
                wordsByCList[key].push({
                    wid: wid,
                    word: wdata.word,
                    meaning_seq: wdata.meaning_seq || 1,
                    desc: wdata.desc || ''
                });
            }
        }
        for (var k in wordsByCList) {
            if (wordsByCList.hasOwnProperty(k) && wordsByCList[k].length > 1) {
                duplicateWords.push({ c_list: JSON.parse(k), words: wordsByCList[k] });
            }
        }

        var duplicateSentences = [];
        var sentencesByKey = {};
        var allSentences = DictStore.loadAllSentences();

        for (var sid in allSentences) {
            if (allSentences.hasOwnProperty(sid)) {
                var sdata = allSentences[sid];
                var punctStr = JSON.stringify(sdata.punct || []);
                var key2 = JSON.stringify(sdata.words || []) + '|' + punctStr;
                if (!sentencesByKey[key2]) sentencesByKey[key2] = [];
                sentencesByKey[key2].push({
                    sid: sid,
                    words: sdata.words || [],
                    punct: sdata.punct || [],
                    desc: sdata.desc || ''
                });
            }
        }
        for (var sk in sentencesByKey) {
            if (sentencesByKey.hasOwnProperty(sk) && sentencesByKey[sk].length > 1) {
                duplicateSentences.push({
                    words: sentencesByKey[sk][0].words,
                    punct: sentencesByKey[sk][0].punct,
                    sentences: sentencesByKey[sk]
                });
            }
        }

        return { duplicate_words: duplicateWords, duplicate_sentences: duplicateSentences };
    }

    var Queries = {
        getAllWords: getAllWords,
        getAllSentences: getAllSentences,
        getAllUnits: getAllUnits,
        getAllCompounds: getAllCompounds,
        getSingleSentence: getSingleSentence,
        getSingleWord: getSingleWord,
        getSingleCompound: getSingleCompound,
        getSingleUnit: getSingleUnit,
        getWordDetail: getWordDetail,
        checkDuplicates: checkDuplicates
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Queries;
    } else {
        global.Queries = Queries;
    }
})(typeof window !== 'undefined' ? window : globalThis);