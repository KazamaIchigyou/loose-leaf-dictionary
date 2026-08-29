(function(global) {
    'use strict';

    var DictStore = global.DictStore;
    var ImageComposer = global.ImageComposer;

    var LINE_HEIGHT = 120;
    var MAX_WIDTH = 2048;

    function init() {
        var input = document.getElementById('article-input');
        if (input) {
            input.addEventListener('input', onInputChange);
        }

        var genBtn = document.getElementById('btn-generate-article');
        if (genBtn) {
            genBtn.addEventListener('click', onGenerate);
        }

        var pickCBtn = document.getElementById('btn-pick-cunit');
        if (pickCBtn) {
            pickCBtn.addEventListener('click', pickCUnit);
        }

        var pickPBtn = document.getElementById('btn-pick-punit');
        if (pickPBtn) {
            pickPBtn.addEventListener('click', pickPUnit);
        }

        var pickWordBtn = document.getElementById('btn-pick-word');
        if (pickWordBtn) {
            pickWordBtn.addEventListener('click', pickWord);
        }

        var pickPunctBtn = document.getElementById('btn-pick-punct');
        if (pickPunctBtn) {
            pickPunctBtn.addEventListener('click', pickPunct);
        }

        var pickBreakBtn = document.getElementById('btn-pick-break');
        if (pickBreakBtn) {
            pickBreakBtn.addEventListener('click', function() {
                insertText('#');
            });
        }

        var preview = document.getElementById('article-preview');
        if (preview) {
            preview.innerHTML = '输入内容后在此预览文章拼接效果...';
        }
    }

    function onInputChange(e) {
        var val = e.target.value.trim();
        var preview = document.getElementById('article-preview');
        if (!val) {
            preview.innerHTML = '输入内容后在此预览文章拼接效果...';
            return;
        }
        var rendered = renderBodyPreview(val);
        preview.innerHTML = rendered;
    }

    function renderBodyPreview(body) {
        var parts = body.split('+');
        var html = '';

        for (var i = 0; i < parts.length; i++) {
            var part = parts[i].trim();
            if (!part) continue;

            if (part === '#') {
                html += '<span style="display:block;width:100%;border-top:2px dashed #ccc;margin:4px 0;"></span>';
                continue;
            }

            if (isPunctuation(part)) {
                html += '<span class="punct">' + escapeHtml(part) + '</span>';
                continue;
            }

            var parsed = parseWordText(part);
            if (parsed.error) {
                html += '<span style="color:#e74c3c" title="' + escapeHtml(parsed.error) + '">' + escapeHtml(part) + '</span>';
            } else {
                var label = parsed.text || part;
                html += '<span class="word-unit" title="' + escapeHtml(parsed.cList.join(' → ')) + '">' + escapeHtml(label) + '</span>';
            }
        }
        return html || '输入内容后在此预览文章拼接效果...';
    }

    function parseWordText(text) {
        if (!text) return { error: '空内容' };

        var fragments = text.split('/');
        var cIndex = DictStore.buildCTextIndex();
        var pIndex = DictStore.buildPByClistIndex();

        var cList = [];
        var displayParts = [];

        for (var i = 0; i < fragments.length; i++) {
            var frag = fragments[i];
            if (!frag) continue;

            if (frag.indexOf('_') !== -1) {
                var subParts = frag.split('_');
                var subCIds = [];
                var subTexts = [];
                for (var sp = 0; sp < subParts.length; sp++) {
                    var part = subParts[sp];
                    if (!cIndex[part]) {
                        return { error: "'" + part + "' 不是已录入的C单元", text: text };
                    }
                    subCIds.push(cIndex[part].cid);
                    subTexts.push(part);
                }
                var key = JSON.stringify(subCIds);
                if (!pIndex[key]) {
                    return { error: "'" + frag + "' 对应的P复合字根未录入", text: text };
                }
                cList.push(pIndex[key].pid);
                displayParts.push(frag);
            } else {
                if (!cIndex[frag]) {
                    return { error: "'" + frag + "' 不是已录入的C单元", text: text };
                }
                cList.push(cIndex[frag].cid);
                displayParts.push(frag);
            }
        }

        if (cList.length === 0) return { error: '内容为空', text: text };

        return { cList: cList, text: displayParts.join(''), displayText: text };
    }

    function isPunctuation(str) {
        return /^[^a-zA-Z0-9\u4e00-\u9fff]+$/.test(str);
    }

    function onGenerate() {
        var input = document.getElementById('article-input');
        var body = input.value.trim();
        if (!body) { alert('请输入文章内容'); return; }

        var output = document.getElementById('article-output');
        output.innerHTML = '<div style="text-align:center;padding:20px;color:#888;">正在生成图片...</div>';

        ImageComposer.renderArticleFromBody(body, LINE_HEIGHT, MAX_WIDTH).then(function(r) {
            if (r.error) {
                output.innerHTML = '<div style="color:#e74c3c;padding:20px;text-align:center;">❌ 生成失败: ' + escapeHtml(r.error) + '</div>';
                return;
            }

            var dataUrl = r.canvas.toDataURL('image/png');
            output.innerHTML =
                '<div style="text-align:center;">' +
                '<img src="' + dataUrl + '" style="max-width:100%;border:1px solid #ddd;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);" />' +
                '<div style="margin-top:12px;display:flex;gap:8px;justify-content:center;">' +
                '<button class="btn btn-primary" onclick="window.open(\'' + dataUrl + '\')">查看原图</button>' +
                '<button class="btn" id="btn-download-article">下载图片</button>' +
                '</div>' +
                '</div>';

            var dlBtn = document.getElementById('btn-download-article');
            if (dlBtn) {
                dlBtn.addEventListener('click', function() {
                    var a = document.createElement('a');
                    a.href = dataUrl;
                    a.download = 'article_' + Date.now() + '.png';
                    a.click();
                });
            }
        }).catch(function(e) {
            output.innerHTML = '<div style="color:#e74c3c;padding:20px;text-align:center;">❌ 生成异常: ' + escapeHtml(e.message) + '</div>';
        });
    }

    function pickCUnit() {
        var index = DictStore.loadIndex();
        var units = index.base_units || [];
        if (units.length === 0) { alert('暂无C单元'); return; }

        var list = '选择C单元（输入编号）:\n';
        units.forEach(function(u, i) {
            list += (i + 1) + '. ' + u.text + ' (' + u.cid + ')\n';
        });
        var choice = prompt(list);
        if (!choice) return;
        var idx = parseInt(choice, 10) - 1;
        if (idx >= 0 && idx < units.length) {
            insertText(units[idx].text);
        }
    }

    function pickPUnit() {
        var index = DictStore.loadIndex();
        var compounds = index.compounds || [];
        if (compounds.length === 0) { alert('暂无P复合字根'); return; }

        var list = '选择P复合字根（输入编号）:\n';
        compounds.forEach(function(c, i) {
            var texts = [];
            for (var j = 0; j < c.c_list.length; j++) {
                var cid = c.c_list[j];
                var cUnit = (index.base_units || []).find(function(u) { return u.cid === cid; });
                texts.push(cUnit ? cUnit.text : cid);
            }
            list += (i + 1) + '. ' + texts.join('_') + ' (' + c.pid + ')\n';
        });
        var choice = prompt(list);
        if (!choice) return;
        var idx = parseInt(choice, 10) - 1;
        if (idx >= 0 && idx < compounds.length) {
            var comp = compounds[idx];
            var texts = [];
            for (var j = 0; j < comp.c_list.length; j++) {
                var cid = comp.c_list[j];
                var cUnit = (index.base_units || []).find(function(u) { return u.cid === cid; });
                texts.push(cUnit ? cUnit.text : cid);
            }
            insertText(texts.join('_'));
        }
    }

    function pickWord() {
        var allWords = DictStore.loadAllWords();
        var wordList = [];
        for (var wid in allWords) {
            if (allWords.hasOwnProperty(wid)) {
                wordList.push({ wid: wid, word: allWords[wid].word, c_list: allWords[wid].c_list });
            }
        }
        if (wordList.length === 0) { alert('暂无单词'); return; }

        var list = '选择单词（输入编号）:\n';
        wordList.forEach(function(w, i) {
            list += (i + 1) + '. ' + w.word + ' (' + w.wid + ')\n';
        });
        var choice = prompt(list);
        if (!choice) return;
        var idx = parseInt(choice, 10) - 1;
        if (idx >= 0 && idx < wordList.length) {
            var w = wordList[idx];
            var cTexts = [];
            for (var j = 0; j < w.c_list.length; j++) {
                var unitId = w.c_list[j];
                var cUnit = findUnitText(unitId);
                cTexts.push(cUnit || unitId);
            }
            insertText(cTexts.join('/'));
        }
    }

    function findUnitText(unitId) {
        var index = DictStore.loadIndex();
        var units = index.base_units || [];
        var compounds = index.compounds || [];

        for (var i = 0; i < units.length; i++) {
            if (units[i].cid === unitId) return units[i].text;
        }
        for (var j = 0; j < compounds.length; j++) {
            if (compounds[j].pid === unitId) {
                var parts = [];
                for (var k = 0; k < compounds[j].c_list.length; k++) {
                    var sub = findUnitText(compounds[j].c_list[k]);
                    parts.push(sub || compounds[j].c_list[k]);
                }
                return parts.join('_');
            }
        }
        return null;
    }

    function pickPunct() {
        var puncts = ['.', ',', '!', '?', '。', '，', '！', '？', '；', '：'];
        var choice = prompt('输入要插入的标点符号:');
        if (choice && choice.trim()) {
            insertText(choice.trim());
        }
    }

    function insertText(text) {
        var input = document.getElementById('article-input');
        var val = input.value;
        if (val && !val.endsWith('+')) val += '+';
        val += text;
        input.value = val;
        onInputChange({ target: input });
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    global.ArticlePage = {
        init: init
    };
})(window);