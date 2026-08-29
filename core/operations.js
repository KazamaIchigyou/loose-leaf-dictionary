/**
 * 业务操作层：执行增删改等实际数据操作
 * 对应 Python 版 services/operations.py
 */
(function(global) {
    'use strict';

    var DictStore = (typeof module !== 'undefined' && module.exports)
        ? require('./dict-store')
        : global.DictStore;

    var Validators = (typeof module !== 'undefined' && module.exports)
        ? require('./validators')
        : global.Validators;

    function addCUnit(text, desc) {
        DictStore.ensureDirs();
        var result = Validators.validate_c(text, desc);
        if (!result[0]) return { success: false, error: result[1] };

        var data = result[2];
        var index = data.index;
        index.base_units.push(data.unit);
        DictStore.saveIndex(index);

        return { success: true, cid: data.cid, text: data.text, message: 'C单元 ' + data.cid + ' "' + data.text + '" 已添加' };
    }

    function addCompound(body, desc) {
        DictStore.ensureDirs();
        var result = Validators.validate_p(body, desc);
        if (!result[0]) return { success: false, error: result[1] };

        var data = result[2];
        var index = data.index;

        index.compounds.push({
            pid: data.pid,
            text: data.text,
            c_list: data.c_list
        });

        if (!index.c2p) index.c2p = {};
        for (var i = 0; i < data.c_list.length; i++) {
            var cid = data.c_list[i];
            if (!index.c2p[cid]) index.c2p[cid] = [];
            index.c2p[cid].push(data.pid);
        }

        DictStore.saveIndex(index);
        DictStore.saveCompound(data.pid, { pid: data.pid, text: data.text, c_list: data.c_list, desc: data.desc });

        return { success: true, pid: data.pid, text: data.text, message: 'P复合字根 ' + data.pid + ' "' + data.text + '" 已添加' };
    }

    function addWord(body, desc) {
        DictStore.ensureDirs();
        var result = Validators.validate_w(body, desc);
        if (!result[0]) return { success: false, error: result[1] };

        var data = result[2];
        var index = data.index;

        if (!index.unit_to_words) index.unit_to_words = {};
        for (var i = 0; i < data.c_list.length; i++) {
            var cid = data.c_list[i];
            if (!index.unit_to_words[cid]) index.unit_to_words[cid] = [];
            index.unit_to_words[cid].push(data.wid);
        }

        DictStore.saveIndex(index);
        DictStore.saveWord(data.wid, {
            wid: data.wid,
            word: data.word,
            c_list: data.c_list,
            meaning_seq: data.meaning_seq,
            desc: data.desc,
            all_sentences: []
        });

        return { success: true, wid: data.wid, word: data.word, meaning_seq: data.meaning_seq, message: 'W单词 ' + data.wid + ' "' + data.word + '" (词义' + data.meaning_seq + ') 已添加' };
    }

    function addSentence(body, desc) {
        DictStore.ensureDirs();
        var result = Validators.validate_s(body, desc);
        if (!result[0]) return { success: false, error: result[1] };

        var data = result[2];
        var index = data.index;

        DictStore.saveSentence(data.sid, {
            sid: data.sid,
            words: data.words,
            punct: data.punct,
            desc: data.desc
        });

        for (var i = 0; i < data.words.length; i++) {
            var wid = data.words[i];
            var wdata = DictStore.loadWord(wid);
            if (wdata) {
                if (!wdata.all_sentences) wdata.all_sentences = [];
                wdata.all_sentences.push(data.sid);
                DictStore.saveWord(wid, wdata);
            }
        }

        return { success: true, sid: data.sid, words: data.words, punct: data.punct, message: 'S句子 ' + data.sid + ' 已添加' };
    }

    function addWNWord(body, desc) {
        return addWord(body, desc);
    }

    function processAllCommands(commands) {
        var results = [];
        for (var i = 0; i < commands.length; i++) {
            var cmd = commands[i];
            var type = cmd[0];
            var body = cmd[1];
            var desc = cmd[2];

            var result;
            switch (type) {
                case 'C': result = addCUnit(body, desc); break;
                case 'P': result = addCompound(body, desc); break;
                case 'W': result = addWord(body, desc); break;
                case 'WN': result = addWNWord(body, desc); break;
                case 'S': result = addSentence(body, desc); break;
                default: result = { success: false, error: '未知指令类型: ' + type };
            }
            results.push({ type: type, body: body, result: result });
        }
        return results;
    }

    var Operations = {
        addCUnit: addCUnit,
        addCompound: addCompound,
        addWord: addWord,
        addSentence: addSentence,
        addWNWord: addWNWord,
        processAllCommands: processAllCommands
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Operations;
    } else {
        global.Operations = Operations;
    }
})(typeof window !== 'undefined' ? window : globalThis);