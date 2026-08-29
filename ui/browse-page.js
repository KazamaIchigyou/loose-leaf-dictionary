(function(global) {
    'use strict';

    var Queries = global.Queries;
    var DictStore = global.DictStore;

    var currentType = 'c';
    var currentSearch = '';
    var savedScrollTop = 0;

    function _loadSavedScroll() {
        try {
            var raw = localStorage.getItem('dict_app_browse_scroll');
            if (raw) {
                var obj = JSON.parse(raw);
                if (obj && typeof obj[currentType] === 'number') {
                    savedScrollTop = obj[currentType];
                    return;
                }
            }
        } catch (e) {}
        savedScrollTop = 0;
    }

    function _persistScroll() {
        try {
            var raw = localStorage.getItem('dict_app_browse_scroll');
            var obj = raw ? JSON.parse(raw) : {};
            obj[currentType] = savedScrollTop;
            localStorage.setItem('dict_app_browse_scroll', JSON.stringify(obj));
        } catch (e) {}
    }

    function _getScrollContainer() {
        var browsePage = document.getElementById('page-browse');
        if (browsePage) {
            var c = browsePage.querySelector('.browse-scroll-wrap');
            if (c) return c;
        }
        var c2 = document.getElementById('app-content');
        return c2 || document.documentElement;
    }

    function saveScroll() {
        var sc = _getScrollContainer();
        savedScrollTop = sc ? (sc.scrollTop || 0) : 0;
        console.log('[BrowsePage] saveScroll type=' + currentType + ' value=' + savedScrollTop);
        _persistScroll();
    }

    function restoreScroll() {
        _loadSavedScroll();
        console.log('[BrowsePage] restoreScroll type=' + currentType + ' value=' + savedScrollTop);
        if (!savedScrollTop) return;
        var sc = _getScrollContainer();
        if (sc) sc.scrollTop = savedScrollTop;
        requestAnimationFrame(function() {
            var sc2 = _getScrollContainer();
            if (sc2) sc2.scrollTop = savedScrollTop;
        });
        setTimeout(function() {
            var sc3 = _getScrollContainer();
            if (sc3) sc3.scrollTop = savedScrollTop;
            console.log('[BrowsePage] setTimeout 50ms actual=' + (sc3 ? sc3.scrollTop : 0));
        }, 50);
        setTimeout(function() {
            var sc4 = _getScrollContainer();
            if (sc4) sc4.scrollTop = savedScrollTop;
            console.log('[BrowsePage] setTimeout 200ms actual=' + (sc4 ? sc4.scrollTop : 0));
        }, 200);
        setTimeout(function() {
            var sc5 = _getScrollContainer();
            if (sc5) sc5.scrollTop = savedScrollTop;
            console.log('[BrowsePage] setTimeout 500ms actual=' + (sc5 ? sc5.scrollTop : 0));
        }, 500);
    }

    function init() {
        var tabs = document.querySelectorAll('#browse-tab-bar .tab');
        tabs.forEach(function(tab) {
            tab.addEventListener('click', function() {
                saveScroll();
                tabs.forEach(function(t) { t.classList.remove('active'); });
                tab.classList.add('active');
                currentType = tab.dataset.type;
                savedScrollTop = 0;
                renderList();
            });
        });

        var searchInput = document.getElementById('browse-search');
        if (searchInput) {
            searchInput.addEventListener('input', function(e) {
                currentSearch = e.target.value.trim().toLowerCase();
                savedScrollTop = 0;
                renderList();
            });
        }

        setTimeout(function() {
            var sc = _getScrollContainer();
            if (sc) {
                sc.addEventListener('scroll', function() {
                    var browsePage = document.getElementById('page-browse');
                    if (browsePage && browsePage.classList.contains('active')) {
                        savedScrollTop = sc.scrollTop || 0;
                        _persistScroll();
                    }
                }, { passive: true });
            }
        }, 0);
    }

    function renderList(preserveScroll) {
        if (preserveScroll) {
            _loadSavedScroll();
        }

        var container = document.getElementById('browse-list');
        container.innerHTML = '';

        var items = [];
        if (currentType === 'c') {
            var result = Queries.getAllUnits();
            items = result.units.map(function(u) {
                return { type: 'c', id: u.cid, title: u.text, badge: 'C', badgeClass: 'badge-c', meta: u.desc || '' };
            });
        } else if (currentType === 'p') {
            var result = Queries.getAllCompounds();
            items = result.compounds.map(function(p) {
                return { type: 'p', id: p.pid, title: p.text, badge: 'P', badgeClass: 'badge-p', meta: (p.desc || '') + (p.body_text ? '  [' + p.body_text + ']' : '') };
            });
        } else if (currentType === 'w') {
            var result = Queries.getAllWords();
            items = result.words.map(function(w) {
                var cTexts = w.c_texts.map(function(ct) { return ct.text; }).join('');
                return { type: 'w', id: w.wid, title: w.word, badge: 'W', badgeClass: 'badge-w', meta: '词义' + w.meaning_seq + ' · ' + cTexts + (w.desc ? ' · ' + w.desc : '') };
            });
        } else if (currentType === 's') {
            var result = Queries.getAllSentences();
            items = result.sentences.map(function(s) {
                return { type: 's', id: s.sid, title: s.preview, badge: 'S', badgeClass: 'badge-s', meta: s.words.length + '个单词' + (s.desc ? ' · ' + s.desc : '') };
            });
        }

        if (currentSearch) {
            items = items.filter(function(it) {
                return it.title.toLowerCase().indexOf(currentSearch) !== -1;
            });
        }

        if (items.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无数据</div>';
            if (preserveScroll) restoreScroll();
            return;
        }

        items.forEach(function(item) {
            var card = document.createElement('div');
            card.className = 'card';
            card.innerHTML =
                '<div class="card-title">' +
                    '<span class="badge ' + item.badgeClass + '">' + item.badge + '</span> ' +
                    escapeHtml(item.title) +
                '</div>' +
                '<div class="card-meta">' + escapeHtml(item.meta) + '</div>';
            card.addEventListener('click', function() {
                saveScroll();
                global.DictApp.showDetail(item.type, item.id);
            });
            container.appendChild(card);
        });

        if (preserveScroll) restoreScroll();
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    global.BrowsePage = {
        init: init,
        renderList: renderList,
        saveScroll: saveScroll,
        restoreScroll: restoreScroll,
        _getRawTarget: function() { return savedScrollTop || 0; }
    };
})(window);