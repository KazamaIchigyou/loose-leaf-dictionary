/**
 * 指令校验器：校验各类指令的合法性
 * 对应 Python 版 services/validators.py
 */
(function(global) {
    'use strict';

    var DictStore = (typeof module !== 'undefined' && module.exports)
        ? require('./dict-store')
        : global.DictStore;

    function checkWordExistsByCList(cList, meaningSeq) {
        var allWords = DictStore.loadAllWords();
        var matches = [];
        for (var wid in allWords) {
            if (allWords.hasOwnProperty(wid)) {
                var wdata = allWords[wid];
                var wCList = wdata.c_list || [];
                if (wCList.length === cList.length) {
                    var same = true;
                    for (var i = 0; i < cList.length; i++) {
                        if (wCList[i] !== cList[i]) { same = false; break; }
                    }
                    if (same) matches.push(wdata);
                }
            }
        }
        if (matches.length > 0) {
            var maxSeq = 0;
            for (var j = 0; j < matches.length; j++) {
                if (matches[j].meaning_seq > maxSeq) maxSeq = matches[j].meaning_seq;
            }
            return maxSeq;
        }
        return 0;
    }

    function validate_c(body, desc) {
        if (!body || !body.trim()) {
            return [false, "C指令内容为空", null];
        }
        var text = body.trim();
        if (text.length > 50) {
            return [false, "文本过长（最多50字符）", null];
        }

        var index = DictStore.loadIndex();
        var units = index.base_units || [];
        for (var i = 0; i < units.length; i++) {
            if (units[i].text === text) {
                return [false, "C单元 \"" + text + "\" 已存在 (CID: " + units[i].cid + ")", null];
            }
        }

        var cid = "C" + String(index.next_cid).padStart(3, '0');
        index.next_cid++;
        var newUnit = {
            cid: cid,
            text: text,
            desc: desc || ''
        };

        return [true, "", {
            type: 'C',
            cid: cid,
            text: text,
            desc: desc || '',
            index: index,
            unit: newUnit
        }];
    }

    function validate_p(body, desc) {
        if (!body || !body.trim()) {
            return [false, "P指令内容为空", null];
        }

        var fragments = body.trim().split('_');
        if (!fragments || fragments.length === 0) {
            return [false, "P指令内容为空", null];
        }

        var cIndex = DictStore.buildCTextIndex();
        var cIds = [];
        for (var i = 0; i < fragments.length; i++) {
            var frag = fragments[i];
            if (!frag) continue;
            if (!cIndex[frag]) {
                return [false, "P中的片段 '" + frag + "' 不是已录入的C单元，请先录入C", null];
            }
            cIds.push(cIndex[frag].cid);
        }

        if (cIds.length === 0) {
            return [false, "复合字根必须至少包含一个有效C单元", null];
        }
        if (cIds.length < 2) {
            return [false, "P（复合字根）必须由至少2个不同的C单元组成，当前只有" + cIds.length + "个", null];
        }

        var displayText = body.replace(/_/g, '');
        var index = DictStore.loadIndex();
        var compounds = index.compounds || [];
        for (var j = 0; j < compounds.length; j++) {
            if (compounds[j].c_list.length === cIds.length) {
                var same = true;
                for (var k = 0; k < cIds.length; k++) {
                    if (compounds[j].c_list[k] !== cIds[k]) { same = false; break; }
                }
                if (same) {
                    return [false, "复合字根已存在: " + compounds[j].pid + " " + compounds[j].text, null];
                }
            }
        }

        var pid = "P" + String(index.next_pid).padStart(3, '0');
        index.next_pid++;

        return [true, "", {
            type: 'P',
            pid: pid,
            text: displayText,
            c_list: cIds,
            desc: desc || '',
            index: index
        }];
    }

    function validate_w(body, desc) {
        if (!body || !body.trim()) {
            return [false, "W指令内容为空", null];
        }

        var fragments = body.trim().split('/');
        if (!fragments || fragments.length === 0) {
            return [false, "W指令内容为空", null];
        }

        var cIndex = DictStore.buildCTextIndex();
        var pIndex = DictStore.buildPByClistIndex();
        var index = DictStore.loadIndex();

        var cList = [];
        for (var i = 0; i < fragments.length; i++) {
            var frag = fragments[i];
            if (!frag) continue;
            if (frag.indexOf('_') !== -1) {
                var subParts = frag.split('_');
                var subCIds = [];
                for (var sp = 0; sp < subParts.length; sp++) {
                    var part = subParts[sp];
                    if (!cIndex[part]) {
                        return [false, "片段 '" + frag + "' 中的 '" + part + "' 不是已录入的C单元，请先录入C", null];
                    }
                    subCIds.push(cIndex[part].cid);
                }
                var key = JSON.stringify(subCIds);
                if (!pIndex[key]) {
                    return [false, "片段 '" + frag + "' 对应的P复合字根未录入，请先用P指令录入", null];
                }
                cList.push(pIndex[key].pid);
            } else {
                if (!cIndex[frag]) {
                    return [false, "片段 '" + frag + "' 不是已录入的C单元，请先录入C", null];
                }
                cList.push(cIndex[frag].cid);
            }
        }

        if (cList.length === 0) {
            return [false, "单词必须至少包含一个有效C/P单元", null];
        }

        var meaningSeq = checkWordExistsByCList(cList);
        meaningSeq++;
        var wid = "W" + String(index.next_word_id).padStart(3, '0');
        index.next_word_id++;

        var displayText = body.replace(/\//g, '').replace(/_/g, '');

        return [true, "", {
            type: 'W',
            wid: wid,
            word: displayText,
            c_list: cList,
            meaning_seq: meaningSeq,
            desc: desc || '',
            index: index
        }];
    }

    function validate_s(body, desc) {
        if (!body || !body.trim()) {
            return [false, "S指令内容为空", null];
        }

        var fragments = body.trim().split('+');
        if (!fragments || fragments.length === 0) {
            return [false, "S指令内容为空", null];
        }

        var cIndex = DictStore.buildCTextIndex();
        var pIndex = DictStore.buildPByClistIndex();
        var wordsMap = DictStore.loadWordTextToIdMap();

        var wordSequence = [];
        var punctList = [];
        var wordIdx = 0;
        var lastIsPunct = false;

        for (var i = 0; i < fragments.length; i++) {
            var frag = fragments[i];
            if (!frag) continue;

            if (frag.indexOf('/') !== -1) {
                var cTexts = frag.split('/');
                var cIds = [];
                for (var ct = 0; ct < cTexts.length; ct++) {
                    var fragct = cTexts[ct];
                    if (fragct.indexOf('_') !== -1) {
                        var subParts = fragct.split('_');
                        var subCIds = [];
                        for (var sp = 0; sp < subParts.length; sp++) {
                            var part = subParts[sp];
                            if (!cIndex[part]) {
                                return [false, "组合单词 '" + frag + "' 中的片段 '" + part + "' 不是已录入的C单元", null];
                            }
                            subCIds.push(cIndex[part].cid);
                        }
                        var key = JSON.stringify(subCIds);
                        if (!pIndex[key]) {
                            return [false, "组合单词 '" + frag + "' 中的 '" + fragct + "' 对应的P复合字根未录入", null];
                        }
                        cIds.push(pIndex[key].pid);
                    } else {
                        if (!cIndex[fragct]) {
                            return [false, "组合单词 '" + frag + "' 中的片段 '" + fragct + "' 不是已录入的C单元", null];
                        }
                        cIds.push(cIndex[fragct].cid);
                    }
                }
                if (cIds.length === 0) {
                    return [false, "组合单词 '" + frag + "' 没有有效C/P单元", null];
                }

                var candidates = _findWordByCList(cIds);
                if (candidates.length === 0) {
                    return [false, "组合单词 '" + frag + "' 未录入系统，请先使用W指令录入", null];
                } else if (candidates.length > 1) {
                    return [false, "组合单词 '" + frag + "' 对应多个词义，请使用具体的单词文本（如去除斜杠）并确保唯一", null];
                } else {
                    wordSequence.push(candidates[0].wid);
                    wordIdx++;
                    lastIsPunct = false;
                }
            } else {
                if (wordsMap[frag]) {
                    var wids = wordsMap[frag];
                    if (wids.length > 1) {
                        return [false, "单词 '" + frag + "' 存在多个词义，请使用组合写法（用 / 连接C/P单元）来明确指代", null];
                    }
                    wordSequence.push(wids[0]);
                    wordIdx++;
                    lastIsPunct = false;
                } else if (frag.indexOf('_') !== -1) {
                    var subParts = frag.split('_');
                    var subCIds = [];
                    for (var sp2 = 0; sp2 < subParts.length; sp2++) {
                        var part2 = subParts[sp2];
                        if (!cIndex[part2]) {
                            return [false, "P引用 '" + frag + "' 中 '" + part2 + "' 不是已录入的C单元", null];
                        }
                        subCIds.push(cIndex[part2].cid);
                    }
                    var key2 = JSON.stringify(subCIds);
                    if (!pIndex[key2]) {
                        return [false, "P引用 '" + frag + "' 对应的P复合字根未录入", null];
                    }
                    var targetPid = pIndex[key2].pid;
                    var pCandidates = _findWordByCList([targetPid]);
                    if (pCandidates.length === 0) {
                        return [false, "P引用 '" + frag + "' 对应的单词未录入，请先用W指令录入", null];
                    }
                    if (pCandidates.length > 1) {
                        return [false, "P引用 '" + frag + "' 对应多个词义，请用 / 组合写法明确指代", null];
                    }
                    wordSequence.push(pCandidates[0].wid);
                    wordIdx++;
                    lastIsPunct = false;
                } else {
                    if (!frag) {
                        return [false, "标点片段不能为空", null];
                    }
                    if (lastIsPunct) {
                        return [false, "禁止标点串直接相邻", null];
                    }
                    if (/[\u4e00-\u9fffA-Za-z0-9]/.test(frag)) {
                        return [false, "标点片段只能包含标点符号，不能包含文字或数字: " + frag, null];
                    }
                    lastIsPunct = true;
                    punctList.push({ idx: wordIdx, tail: frag });
                }
            }
        }

        if (wordSequence.length === 0) {
            return [false, "句子必须包含至少一个单词", null];
        }

        var index = DictStore.loadIndex();
        var sid = "S" + String(index.next_sentence_id).padStart(3, '0');
        index.next_sentence_id++;

        return [true, "", {
            type: 'S',
            sid: sid,
            words: wordSequence,
            punct: punctList,
            desc: desc || '',
            index: index
        }];
    }

    function validate_wn(body, desc) {
        if (!body || !body.trim()) {
            return [false, "WN指令内容为空", null];
        }
        return validate_w(body, desc);
    }

    function _findWordByCList(cList) {
        var allWords = DictStore.loadAllWords();
        var candidates = [];
        for (var wid in allWords) {
            if (allWords.hasOwnProperty(wid)) {
                var wdata = allWords[wid];
                var wCList = wdata.c_list || [];
                if (wCList.length === cList.length) {
                    var same = true;
                    for (var i = 0; i < cList.length; i++) {
                        if (wCList[i] !== cList[i]) { same = false; break; }
                    }
                    if (same) candidates.push({ wid: wid, meaning_seq: wdata.meaning_seq || 1 });
                }
            }
        }
        candidates.sort(function(a, b) { return a.meaning_seq - b.meaning_seq; });
        return candidates;
    }

    var Validators = {
        checkWordExistsByCList: checkWordExistsByCList,
        validate_c: validate_c,
        validate_p: validate_p,
        validate_w: validate_w,
        validate_s: validate_s,
        validate_wn: validate_wn,
        _findWordByCList: _findWordByCList
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Validators;
    } else {
        global.Validators = Validators;
    }
})(typeof window !== 'undefined' ? window : globalThis);