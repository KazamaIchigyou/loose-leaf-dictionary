(function(global) {
    'use strict';

    var _type = 'c';
    var _titleMap = { c: 'C单元', p: 'P复合', w: 'W单词', s: 'S句子' };
    var _cols = parseInt(localStorage.getItem('textlist_cols'), 10) || 2;
    var _minCols = 1;
    var _maxCols = 4;

    function _updateColsDisplay() {
        var num = document.getElementById('textlist-cols-num');
        if (num) num.textContent = _cols;
        var minus = document.getElementById('textlist-cols-minus');
        var plus = document.getElementById('textlist-cols-plus');
        if (minus) minus.style.opacity = _cols <= _minCols ? '0.4' : '';
        if (plus) plus.style.opacity = _cols >= _maxCols ? '0.4' : '';
    }

    function _applyCols() {
        var listEl = document.getElementById('textlist-list');
        if (listEl) {
            listEl.style.gridTemplateColumns = 'repeat(' + _cols + ', 1fr)';
        }
        localStorage.setItem('textlist_cols', _cols);
        _updateColsDisplay();
    }

    function init() {
        var backBtn = document.getElementById('btn-textlist-back');
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                global.DictApp.hideTextList();
            });
        }

        var minus = document.getElementById('textlist-cols-minus');
        var plus = document.getElementById('textlist-cols-plus');
        if (minus) {
            minus.addEventListener('click', function() {
                if (_cols > _minCols) { _cols--; _applyCols(); }
            });
        }
        if (plus) {
            plus.addEventListener('click', function() {
                if (_cols < _maxCols) { _cols++; _applyCols(); }
            });
        }
    }

    function show(type) {
        _type = type;
        var titleEl = document.getElementById('textlist-title');
        var listEl = document.getElementById('textlist-list');
        if (titleEl) titleEl.textContent = (_titleMap[type] || type) + ' 列表';
        if (!listEl) return;

        listEl.innerHTML = '';

        var items = _loadItems(type);

        if (items.length === 0) {
            listEl.innerHTML = '<div class="empty-state">暂无数据</div>';
            return;
        }

        items.forEach(function(item) {
            var row = document.createElement('div');
            row.className = 'textlist-item';
            row.textContent = item.text;
            row.addEventListener('click', function() {
                global.DictApp.showDetail(type, item.id);
            });
            listEl.appendChild(row);
        });

        _applyCols();
    }

    function _loadItems(type) {
        var Queries = global.Queries;
        var result = [];
        if (type === 'c') {
            var cRes = Queries.getAllUnits();
            (cRes.units || []).forEach(function(u) {
                result.push({ id: u.cid, text: u.text });
            });
        } else if (type === 'p') {
            var pRes = Queries.getAllCompounds();
            (pRes.compounds || []).forEach(function(p) {
                result.push({ id: p.pid, text: p.text });
            });
        } else if (type === 'w') {
            var wRes = Queries.getAllWords();
            (wRes.words || []).forEach(function(w) {
                result.push({ id: w.wid, text: w.word });
            });
        } else if (type === 's') {
            var sRes = Queries.getAllSentences();
            (sRes.sentences || []).forEach(function(s) {
                result.push({ id: s.sid, text: s.preview });
            });
        }
        return result;
    }

    global.TextListPage = {
        init: init,
        show: show
    };
})(window);