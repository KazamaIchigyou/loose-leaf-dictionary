/**
 * 更新/删除层：修改和删除 P/W/S/C 的相关逻辑
 * 对应 Python 版 routes/update_routes.py
 */
(function(global) {
    'use strict';

    var DictStore = (typeof module !== 'undefined' && module.exports)
        ? require('./dict-store')
        : global.DictStore;

    function updateWordDesc(wid, desc) {
        var data = DictStore.loadWord(wid);
        if (!data) return { error: '单词 ' + wid + ' 不存在' };
        data.desc = desc;
        DictStore.saveWord(wid, data);
        return { success: true, wid: wid };
    }

    function updateSentenceDesc(sid, desc) {
        var data = DictStore.loadSentence(sid);
        if (!data) return { error: '句子 ' + sid + ' 不存在' };
        data.desc = desc;
        DictStore.saveSentence(sid, data);
        return { success: true, sid: sid };
    }

    function updatePDesc(pid, desc) {
        var pdata = DictStore.loadCompound(pid);
        if (!pdata) return { error: '复合字根 ' + pid + ' 不存在' };
        pdata.desc = desc;
        DictStore.saveCompound(pid, pdata);
        return { success: true, pid: pid };
    }

    function updateCDesc(cid, desc) {
        var index = DictStore.loadIndex();
        var units = index.base_units || [];
        for (var i = 0; i < units.length; i++) {
            if (units[i].cid === cid) {
                units[i].desc = desc;
                DictStore.saveIndex(index);
                return { success: true, cid: cid };
            }
        }
        return { error: '基础字根 ' + cid + ' 不存在' };
    }

    function updateCText(cid, newText) {
        newText = (newText || '').trim();
        if (!newText) return { error: 'text 不能为空' };

        var index = DictStore.loadIndex();
        var units = index.base_units || [];
        var unit = null;
        for (var i = 0; i < units.length; i++) {
            if (units[i].cid === cid) { unit = units[i]; break; }
        }
        if (!unit) return { error: '基础字根 ' + cid + ' 不存在' };

        for (var j = 0; j < units.length; j++) {
            if (units[j].cid !== cid && units[j].text === newText) {
                return { error: '字 "' + newText + '" 已存在于 ' + units[j].cid };
            }
        }

        var oldText = unit.text;
        unit.text = newText;

        var compounds = index.compounds || [];
        for (var k = 0; k < compounds.length; k++) {
            var comp = compounds[k];
            if (comp.c_list && comp.c_list.indexOf(cid) !== -1) {
                var pParts = [];
                for (var ci = 0; ci < comp.c_list.length; ci++) {
                    var cu = _findUnit(index, comp.c_list[ci]);
                    pParts.push(cu ? cu.text : '?');
                }
                comp.text = pParts.join('');
            }
        }

        DictStore.saveIndex(index);
        return { success: true, cid: cid, old_text: oldText, new_text: newText };
    }

    function updatePList(pid, newBody) {
        var pdata = DictStore.loadCompound(pid);
        if (!pdata) return { error: '复合字根 ' + pid + ' 不存在' };

        var index = DictStore.loadIndex();
        var result = _validatePForUpdate(newBody, index);
        if (!result.ok) return { error: result.error };

        var newCList = result.c_list;
        var newText = result.text;

        var compounds = index.compounds || [];
        for (var i = 0; i < compounds.length; i++) {
            if (compounds[i].pid !== pid && _arrayEqual(compounds[i].c_list, newCList)) {
                return { error: '复合字根已存在（相同C单元组合）: ' + compounds[i].pid + ' ' + compounds[i].text };
            }
        }

        var oldCList = pdata.c_list.slice();
        for (var j = 0; j < compounds.length; j++) {
            if (compounds[j].pid === pid) {
                compounds[j].c_list = newCList;
                compounds[j].text = newText;
                break;
            }
        }

        if (!index.c2p) index.c2p = {};
        for (var oc = 0; oc < oldCList.length; oc++) {
            var oldCid = oldCList[oc];
            if (index.c2p[oldCid]) {
                var idx = index.c2p[oldCid].indexOf(pid);
                if (idx !== -1) index.c2p[oldCid].splice(idx, 1);
            }
        }
        for (var nc = 0; nc < newCList.length; nc++) {
            var newCid = newCList[nc];
            if (!index.c2p[newCid]) index.c2p[newCid] = [];
            index.c2p[newCid].push(pid);
        }

        pdata.c_list = newCList;
        pdata.text = newText;
        DictStore.saveCompound(pid, pdata);
        DictStore.saveIndex(index);

        return { success: true, pid: pid, text: newText, c_list: newCList };
    }

    function updateWList(wid, newBody) {
        var wdata = DictStore.loadWord(wid);
        if (!wdata) return { error: '单词 ' + wid + ' 不存在' };

        var index = DictStore.loadIndex();
        var result = _validateWForUpdate(newBody, index);
        if (!result.ok) return { error: result.error };

        var newCList = result.c_ids;
        var newDisplayText = newBody.replace(/\//g, '').replace(/_/g, '');

        var allWords = DictStore.loadAllWords();
        var duplicateWids = [];
        for (var otherWid in allWords) {
            if (allWords.hasOwnProperty(otherWid) && otherWid !== wid) {
                if (_arrayEqual(allWords[otherWid].c_list, newCList)) {
                    duplicateWids.push(otherWid);
                }
            }
        }
        if (duplicateWids.length > 0) {
            return {
                success: true,
                confirm_needed: true,
                message: '已有相同c_list的单词: ' + duplicateWids.join(', ') + '，是否仍要修改？',
                wid: wid,
                duplicate_wids: duplicateWids,
                c_list: newCList,
                display_text: newDisplayText
            };
        }

        _executeWListUpdate(wid, wdata, index, newCList, newDisplayText);
        return { success: true, wid: wid, word: newDisplayText, c_list: newCList };
    }

    function confirmWListUpdate(wid, cList, displayText) {
        var wdata = DictStore.loadWord(wid);
        if (!wdata) return { error: '单词 ' + wid + ' 不存在' };
        var index = DictStore.loadIndex();
        var display = displayText || _computeDisplayTextFromCList(cList);
        _executeWListUpdate(wid, wdata, index, cList, display);
        return { success: true, wid: wid, word: display, c_list: cList };
    }

    function updateSList(sid, newBody) {
        var sdata = DictStore.loadSentence(sid);
        if (!sdata) return { error: '句子 ' + sid + ' 不存在' };

        var index = DictStore.loadIndex();
        var wordsMap = DictStore.loadWordTextToIdMap();
        var result = _validateSForUpdate(newBody, index, wordsMap);
        if (!result.ok) return { error: result.error };

        var newWords = result.words;
        var newPunct = result.punct;

        var allSentences = DictStore.loadAllSentences();
        for (var otherSid in allSentences) {
            if (allSentences.hasOwnProperty(otherSid) && otherSid !== sid) {
                var sd = allSentences[otherSid];
                if (_arrayEqual(sd.words, newWords) && _punctEqual(sd.punct, newPunct)) {
                    return { error: '句子已存在（相同单词序列和标点序列），拒绝重复录入' };
                }
            }
        }

        _executeSListUpdate(sid, sdata, index, newWords, newPunct);
        return { success: true, sid: sid, words: newWords, punct: newPunct };
    }

    function checkDeleteP(pid) {
        var index = DictStore.loadIndex();
        var compounds = index.compounds || [];
        var comp = null;
        for (var i = 0; i < compounds.length; i++) {
            if (compounds[i].pid === pid) { comp = compounds[i]; break; }
        }
        if (!comp) return { error: '复合字根 ' + pid + ' 不存在' };

        var refWids = (index.unit_to_words && index.unit_to_words[pid]) || [];
        if (refWids.length > 0) {
            return { can_delete: false, ref_wids: refWids, message: '复合字根 ' + pid + ' 已被引用' };
        }
        return { can_delete: true, ref_wids: [], message: '复合字根 ' + pid + ' 未被引用' };
    }

    function checkDeleteW(wid) {
        var wdata = DictStore.loadWord(wid);
        if (!wdata) return { error: '单词 ' + wid + ' 不存在' };
        var allSentences = DictStore.loadAllSentences();
        var refSids = [];
        for (var sid in allSentences) {
            if (allSentences.hasOwnProperty(sid)) {
                var words = allSentences[sid].words || [];
                if (words.indexOf(wid) !== -1) refSids.push(sid);
            }
        }
        if (refSids.length > 0) {
            return { can_delete: false, ref_sids: refSids, message: '单词 ' + wid + ' 已被引用' };
        }
        return { can_delete: true, ref_sids: [], message: '单词 ' + wid + ' 未被引用' };
    }

    function checkDeleteS(sid) {
        var sdata = DictStore.loadSentence(sid);
        if (!sdata) return { error: '句子 ' + sid + ' 不存在' };
        return { can_delete: true, ref_wids: [], ref_sids: [], message: '句子 ' + sid + ' 未被引用' };
    }

    function deleteP(pid) {
        var index = DictStore.loadIndex();
        var compounds = index.compounds || [];
        var comp = null;
        for (var i = 0; i < compounds.length; i++) {
            if (compounds[i].pid === pid) { comp = compounds[i]; break; }
        }
        if (!comp) return { error: '复合字根 ' + pid + ' 不存在' };

        var refWids = (index.unit_to_words && index.unit_to_words[pid]) || [];
        if (refWids.length > 0) {
            return { error: '复合字根 ' + pid + ' 被以下单词引用，无法删除', ref_wids: refWids };
        }

        if (index.c2p) {
            var cList = comp.c_list || [];
            for (var c = 0; c < cList.length; c++) {
                var cid = cList[c];
                if (index.c2p[cid]) {
                    var idx = index.c2p[cid].indexOf(pid);
                    if (idx !== -1) index.c2p[cid].splice(idx, 1);
                }
            }
        }

        index.compounds = compounds.filter(function(c) { return c.pid !== pid; });
        if (index.unit_to_words && index.unit_to_words[pid]) {
            delete index.unit_to_words[pid];
        }

        DictStore.saveIndex(index);

        if (DictStore.deleteCompound) DictStore.deleteCompound(pid);

        var fs = (typeof module !== 'undefined' && module.exports) ? require('fs') : null;
        if (fs) {
            var path = require('path');
            var pfile = path.join(DictStore.COMPOUNDS_DIR, pid + '.json');
            if (fs.existsSync(pfile)) fs.unlinkSync(pfile);
        }

        DictStore.deleteImage(pid);
        return { success: true, pid: pid };
    }

    function deleteW(wid) {
        var wdata = DictStore.loadWord(wid);
        if (!wdata) return { error: '单词 ' + wid + ' 不存在' };

        var index = DictStore.loadIndex();
        var allSentences = DictStore.loadAllSentences();
        var refSids = [];
        for (var sid in allSentences) {
            if (allSentences.hasOwnProperty(sid)) {
                var words = allSentences[sid].words || [];
                if (words.indexOf(wid) !== -1) refSids.push(sid);
            }
        }
        if (refSids.length > 0) {
            return { error: '单词 ' + wid + ' 被以下句子引用，无法删除', ref_sids: refSids };
        }

        var cList = wdata.c_list || [];
        for (var c = 0; c < cList.length; c++) {
            var cid = cList[c];
            if (index.unit_to_words && index.unit_to_words[cid]) {
                var idx = index.unit_to_words[cid].indexOf(wid);
                if (idx !== -1) index.unit_to_words[cid].splice(idx, 1);
            }
        }

        DictStore.saveIndex(index);

        if (DictStore.deleteWord) DictStore.deleteWord(wid);

        var fs = (typeof module !== 'undefined' && module.exports) ? require('fs') : null;
        if (fs) {
            var path = require('path');
            var wfile = path.join(DictStore.WORDS_DIR, wid + '.json');
            if (fs.existsSync(wfile)) fs.unlinkSync(wfile);
        }

        DictStore.deleteImage(wid);
        return { success: true, wid: wid };
    }

    function deleteS(sid) {
        var sdata = DictStore.loadSentence(sid);
        if (!sdata) return { error: '句子 ' + sid + ' 不存在' };

        var words = sdata.words || [];
        for (var i = 0; i < words.length; i++) {
            var wdata = DictStore.loadWord(words[i]);
            if (wdata && wdata.all_sentences) {
                var idx = wdata.all_sentences.indexOf(sid);
                if (idx !== -1) wdata.all_sentences.splice(idx, 1);
                DictStore.saveWord(words[i], wdata);
            }
        }

        if (DictStore.deleteSentence) DictStore.deleteSentence(sid);

        var fs = (typeof module !== 'undefined' && module.exports) ? require('fs') : null;
        if (fs) {
            var path = require('path');
            var sfile = path.join(DictStore.SENTENCES_DIR, sid + '.json');
            if (fs.existsSync(sfile)) fs.unlinkSync(sfile);
        }

        return { success: true, sid: sid };
    }

    // ========== 辅助函数 ==========

    function _validatePForUpdate(body, index) {
        if (!body) return { ok: false, error: 'P指令内容为空' };
        var fragments = body.split('_');
        var cIndex = {};
        var units = index.base_units || [];
        for (var i = 0; i < units.length; i++) cIndex[units[i].text] = units[i];

        var cIds = [];
        for (var f = 0; f < fragments.length; f++) {
            if (!fragments[f]) continue;
            if (!cIndex[fragments[f]]) {
                return { ok: false, error: "P中的片段 '" + fragments[f] + "' 不是已录入的C单元" };
            }
            cIds.push(cIndex[fragments[f]].cid);
        }
        if (cIds.length === 0) return { ok: false, error: '复合字根必须至少包含一个有效C单元' };
        if (cIds.length < 2) return { ok: false, error: 'P（复合字根）必须由至少2个不同的C单元组成' };

        return { ok: true, c_list: cIds, text: body.replace(/_/g, '') };
    }

    function _validateWForUpdate(body, index) {
        if (!body) return { ok: false, error: 'W指令内容为空' };
        var fragments = body.split('/');
        var cIndex = {};
        var units = index.base_units || [];
        for (var i = 0; i < units.length; i++) cIndex[units[i].text] = units[i];

        var pIndex = {};
        var compounds = index.compounds || [];
        for (var j = 0; j < compounds.length; j++) {
            pIndex[JSON.stringify(compounds[j].c_list)] = compounds[j];
        }

        var cList = [];
        for (var f = 0; f < fragments.length; f++) {
            var frag = fragments[f];
            if (!frag) continue;
            if (frag.indexOf('_') !== -1) {
                var subParts = frag.split('_');
                var subCIds = [];
                for (var sp = 0; sp < subParts.length; sp++) {
                    if (!cIndex[subParts[sp]]) {
                        return { ok: false, error: "片段 '" + frag + "' 中的 '" + subParts[sp] + "' 不是已录入的C单元" };
                    }
                    subCIds.push(cIndex[subParts[sp]].cid);
                }
                var key = JSON.stringify(subCIds);
                if (!pIndex[key]) {
                    return { ok: false, error: "片段 '" + frag + "' 对应的P复合字根未录入" };
                }
                cList.push(pIndex[key].pid);
            } else {
                if (!cIndex[frag]) {
                    return { ok: false, error: "片段 '" + frag + "' 不是已录入的C单元" };
                }
                cList.push(cIndex[frag].cid);
            }
        }
        if (cList.length === 0) return { ok: false, error: '单词必须至少包含一个有效C/P单元' };
        return { ok: true, c_ids: cList };
    }

    function _validateSForUpdate(body, index, wordsMap) {
        if (!body) return { ok: false, error: 'S指令内容为空' };
        var fragments = body.split('+');
        var cIndex = {};
        var units = index.base_units || [];
        for (var i = 0; i < units.length; i++) cIndex[units[i].text] = units[i];

        var pIndex = {};
        var compounds = index.compounds || [];
        for (var j = 0; j < compounds.length; j++) {
            pIndex[JSON.stringify(compounds[j].c_list)] = compounds[j];
        }

        var wordSequence = [];
        var punctList = [];
        var wordIdx = 0;
        var lastIsPunct = false;

        for (var f = 0; f < fragments.length; f++) {
            var frag = fragments[f];
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
                            if (!cIndex[subParts[sp]]) {
                                return { ok: false, error: "组合单词 '" + frag + "' 中的 '" + subParts[sp] + "' 不是已录入的C单元" };
                            }
                            subCIds.push(cIndex[subParts[sp]].cid);
                        }
                        var key = JSON.stringify(subCIds);
                        if (!pIndex[key]) {
                            return { ok: false, error: "组合单词 '" + frag + "' 中的 '" + fragct + "' 对应的P复合字根未录入" };
                        }
                        cIds.push(pIndex[key].pid);
                    } else {
                        if (!cIndex[fragct]) {
                            return { ok: false, error: "组合单词 '" + frag + "' 中的 '" + fragct + "' 不是已录入的C单元" };
                        }
                        cIds.push(cIndex[fragct].cid);
                    }
                }
                if (cIds.length === 0) return { ok: false, error: "组合单词 '" + frag + "' 没有有效C/P单元" };

                var candidates = _findWordByCList(cIds);
                if (candidates.length === 0) {
                    // 无对应W条目，但CP结构有效，存储CP结构引用
                    wordSequence.push({ c_list: cIds });
                    wordIdx++;
                    lastIsPunct = false;
                    continue;
                }
                if (candidates.length > 1) return { ok: false, error: "组合单词 '" + frag + "' 对应多个词义" };
                wordSequence.push(candidates[0]);
                wordIdx++;
                lastIsPunct = false;
            } else if (wordsMap[frag]) {
                var wids = wordsMap[frag];
                if (wids.length > 1) {
                    return { ok: false, error: "单词 '" + frag + "' 存在多个词义，请使用组合写法明确指代" };
                }
                wordSequence.push(wids[0]);
                wordIdx++;
                lastIsPunct = false;
            } else if (cIndex[frag]) {
                // 无对应W条目，但C单元有效，存储C单元引用
                wordSequence.push({ c_list: [cIndex[frag].cid] });
                wordIdx++;
                lastIsPunct = false;
            } else if (frag.indexOf('_') !== -1) {
                var subParts2 = frag.split('_');
                var subCIds2 = [];
                for (var sp2 = 0; sp2 < subParts2.length; sp2++) {
                    if (!cIndex[subParts2[sp2]]) {
                        return { ok: false, error: "P引用 '" + frag + "' 中 '" + subParts2[sp2] + "' 不是已录入的C单元" };
                    }
                    subCIds2.push(cIndex[subParts2[sp2]].cid);
                }
                var key2 = JSON.stringify(subCIds2);
                if (!pIndex[key2]) {
                    return { ok: false, error: "P引用 '" + frag + "' 对应的P复合字根未录入" };
                }
                var targetPid = pIndex[key2].pid;
                var pCandidates = _findWordByCList([targetPid]);
                if (pCandidates.length === 0) {
                    // 无对应W条目，但P结构有效，存储P单元引用
                    wordSequence.push({ c_list: [targetPid] });
                    wordIdx++;
                    lastIsPunct = false;
                    continue;
                }
                if (pCandidates.length > 1) return { ok: false, error: "P引用 '" + frag + "' 对应多个词义" };
                wordSequence.push(pCandidates[0]);
                wordIdx++;
                lastIsPunct = false;
            } else {
                if (!frag) return { ok: false, error: '标点片段不能为空' };
                if (lastIsPunct) return { ok: false, error: '禁止标点串直接相邻' };
                if (/[\u4e00-\u9fffA-Za-z0-9]/.test(frag)) {
                    return { ok: false, error: '标点片段只能包含标点符号，不能包含文字或数字: ' + frag };
                }
                lastIsPunct = true;
                punctList.push({ idx: wordIdx, tail: frag });
            }
        }

        if (wordSequence.length === 0) return { ok: false, error: '句子必须包含至少一个单词' };
        return { ok: true, words: wordSequence, punct: punctList };
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
                    if (same) candidates.push(wid);
                }
            }
        }
        return candidates;
    }

    function _executeWListUpdate(wid, wdata, index, newCList, newDisplayText) {
        var oldCList = wdata.c_list || [];
        if (!index.unit_to_words) index.unit_to_words = {};
        for (var i = 0; i < oldCList.length; i++) {
            var oldCid = oldCList[i];
            if (index.unit_to_words[oldCid]) {
                var idx = index.unit_to_words[oldCid].indexOf(wid);
                if (idx !== -1) index.unit_to_words[oldCid].splice(idx, 1);
            }
        }
        for (var j = 0; j < newCList.length; j++) {
            var newCid = newCList[j];
            if (!index.unit_to_words[newCid]) index.unit_to_words[newCid] = [];
            index.unit_to_words[newCid].push(wid);
        }
        wdata.c_list = newCList;
        wdata.word = newDisplayText;
        DictStore.saveWord(wid, wdata);
        DictStore.saveIndex(index);
    }

    function _executeSListUpdate(sid, sdata, index, newWords, newPunct) {
        var oldWords = sdata.words || [];
        for (var i = 0; i < oldWords.length; i++) {
            var wdata = DictStore.loadWord(oldWords[i]);
            if (wdata && wdata.all_sentences) {
                var idx = wdata.all_sentences.indexOf(sid);
                if (idx !== -1) wdata.all_sentences.splice(idx, 1);
                DictStore.saveWord(oldWords[i], wdata);
            }
        }
        for (var j = 0; j < newWords.length; j++) {
            var wdata2 = DictStore.loadWord(newWords[j]);
            if (wdata2) {
                if (!wdata2.all_sentences) wdata2.all_sentences = [];
                if (wdata2.all_sentences.indexOf(sid) === -1) {
                    wdata2.all_sentences.push(sid);
                    DictStore.saveWord(newWords[j], wdata2);
                }
            }
        }
        sdata.words = newWords;
        sdata.punct = newPunct;
        DictStore.saveSentence(sid, sdata);
        DictStore.saveIndex(index);
    }

    function _computeDisplayTextFromCList(cList) {
        var index = DictStore.loadIndex();
        var cTextMap = {};
        var units = index.base_units || [];
        for (var i = 0; i < units.length; i++) cTextMap[units[i].cid] = units[i].text;
        var compounds = index.compounds || [];
        for (var j = 0; j < compounds.length; j++) {
            var cParts = [];
            var cList2 = compounds[j].c_list || [];
            for (var ci = 0; ci < cList2.length; ci++) {
                cParts.push(cTextMap[cList2[ci]] || '?');
            }
            cTextMap[compounds[j].pid] = cParts.join('');
        }
        var parts = [];
        for (var k = 0; k < cList.length; k++) {
            parts.push(cTextMap[cList[k]] || '?');
        }
        return parts.join('');
    }

    function _findUnit(index, cid) {
        var units = index.base_units || [];
        for (var i = 0; i < units.length; i++) {
            if (units[i].cid === cid) return units[i];
        }
        return null;
    }

    function _arrayEqual(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) {
            if (typeof a[i] === 'object' && typeof b[i] === 'object') {
                if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false;
            } else if (a[i] !== b[i]) {
                return false;
            }
        }
        return true;
    }

    function _punctEqual(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) {
            if (a[i].idx !== b[i].idx || a[i].tail !== b[i].tail) return false;
        }
        return true;
    }

    var Updates = {
        updateWordDesc: updateWordDesc,
        updateSentenceDesc: updateSentenceDesc,
        updatePDesc: updatePDesc,
        updateCDesc: updateCDesc,
        updateCText: updateCText,
        updatePList: updatePList,
        updateWList: updateWList,
        confirmWListUpdate: confirmWListUpdate,
        updateSList: updateSList,
        checkDeleteP: checkDeleteP,
        checkDeleteW: checkDeleteW,
        checkDeleteS: checkDeleteS,
        deleteP: deleteP,
        deleteW: deleteW,
        deleteS: deleteS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Updates;
    } else {
        global.Updates = Updates;
    }
})(typeof window !== 'undefined' ? window : globalThis);