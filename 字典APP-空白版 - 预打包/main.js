(function(global) {
    'use strict';

    var _detailBackStack = [];
    var _currentDetail = null;

    async function init() {
        try {
            await DictStore.ready();
        } catch (e) {
            console.error('数据加载失败:', e);
        }

        try { DictApp.initData(); } catch (e) { console.error('[INIT] initData 失败:', e); }
        try { EditPage.init(); } catch (e) { console.error('[INIT] EditPage.init 失败:', e); }
        try { BrowsePage.init(); } catch (e) { console.error('[INIT] BrowsePage.init 失败:', e); }
        try { Looseleaf.init(); } catch (e) { console.error('[INIT] Looseleaf.init 失败:', e); }
        try { ArticlePage.init(); } catch (e) { console.error('[INIT] ArticlePage.init 失败:', e); }
        try { EditPage.updateStats(); } catch (e) { console.error('[INIT] updateStats 失败:', e); }

        // Tab 切换绑定用事件委托，绑在 document 上，保证一定生效（就算前面 init 崩了也能切页）
        document.addEventListener('click', function(e) {
            var tab = e.target.closest('.app-tab');
            if (tab && tab.dataset.page) {
                try {
                    switchPage(tab.dataset.page);
                } catch (err) {
                    console.error('[switchPage] 切换失败:', err);
                    alert('切换页面失败: ' + (err.message || err));
                }
            }
            var backBtn = e.target.closest('#btn-back');
            if (backBtn) {
                try { DictApp.hideDetail(); } catch (err) {
                    console.error('[hideDetail] 失败:', err);
                }
            }
        });

        if (!localStorage.getItem('dict_app_intro_shown')) {
            try { setTimeout(showIntro, 300); } catch(e) {}
        }
    }

    function switchPage(pageName, preserveScroll) {
        console.log('[switchPage] 目标页面:', pageName, 'preserveScroll=', preserveScroll);
        try {
            document.querySelectorAll('.app-tab').forEach(function(t) {
                t.classList.toggle('active', t.dataset.page === pageName);
            });
        } catch(e) { console.warn('Tab 高亮失败:', e); }

        try {
            document.querySelectorAll('.page').forEach(function(p) {
                p.classList.remove('active');
            });
            document.getElementById('app-content').classList.remove('detail-mode');
        } catch(e) { console.warn('旧页面隐藏失败:', e); }

        try {
            var pageId = 'page-' + pageName;
            var page = document.getElementById(pageId);
            if (page) {
                page.classList.add('active');
            } else {
                console.error('[switchPage] 找不到页面节点: ' + pageId);
                return;
            }
        } catch(e) { console.warn('新页面激活失败:', e); }

        try {
            if (pageName === 'browse' && !preserveScroll) BrowsePage.renderList(false);
            else if (pageName === 'browse') BrowsePage.renderList(true);
            else if (pageName === 'setting') EditPage.updateStats();
        } catch(e) { console.warn('页面回调失败:', e); }
    }

    function showDetail(type, id) {
        if (_currentDetail) {
            _detailBackStack.push({ kind: 'detail', type: _currentDetail.type, id: _currentDetail.id });
        } else {
            var fromPage = 'browse';
            var activeTab = document.querySelector('#app-tabs .app-tab.active');
            if (activeTab && activeTab.dataset.page) {
                fromPage = activeTab.dataset.page;
            }
            _detailBackStack.push({ kind: 'tab', page: fromPage });
        }
        _currentDetail = { type: type, id: id };
        console.log('[DictApp] showDetail', type, id, 'stack:', _detailBackStack);
        document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
        document.getElementById('page-detail').classList.add('active');
        document.getElementById('app-content').classList.add('detail-mode');
        Looseleaf.show(type, id);
    }

    function hideDetail() {
        if (_detailBackStack.length === 0) {
            _currentDetail = null;
            document.getElementById('page-detail').classList.remove('active');
            document.getElementById('app-content').classList.remove('detail-mode');
            switchPage('browse', true);
            return;
        }
        var backTo = _detailBackStack.pop();
        console.log('[DictApp] hideDetail pop=', backTo, 'remaining stack:', _detailBackStack);

        if (backTo.kind === 'detail') {
            _currentDetail = { type: backTo.type, id: backTo.id };
            Looseleaf.show(backTo.type, backTo.id);
            var detailSc = document.getElementById('page-detail');
            if (detailSc) { detailSc.scrollTop = 0; detailSc.scrollIntoView({ block: 'start' }); }
            document.getElementById('page-detail').classList.add('active');
            document.getElementById('app-content').classList.add('detail-mode');
            return;
        }

        var pageName = backTo.page;
        _currentDetail = null;
        document.getElementById('page-detail').classList.remove('active');
        document.getElementById('app-content').classList.remove('detail-mode');
        switchPage(pageName, true);
        if (pageName === 'browse') {
            BrowsePage.restoreScroll();
            var attempts = 0;
            var forceTimer = setInterval(function() {
                attempts++;
                var sc = document.getElementById('app-content');
                var browseWrap = document.querySelector('#page-browse .browse-scroll-wrap');
                var target = BrowsePage && BrowsePage._getRawTarget != null ? BrowsePage._getRawTarget() : 0;
                if (sc) sc.scrollTop = 0;
                if (browseWrap) browseWrap.scrollTop = target;
                console.log('[DictApp] force restore attempt ' + attempts + ' target=' + target + ' wrapActual=' + (browseWrap ? browseWrap.scrollTop : 0));
                if (attempts >= 6) clearInterval(forceTimer);
            }, 80);
        }
    }

    function showIntro() {
        var dialog = document.createElement('div');
        dialog.className = 'confirm-dialog';
        dialog.innerHTML =
            '<div class="dialog">' +
            '<h3>电子活页字典</h3>' +
            '<p style="font-size:13px;color:#666;line-height:1.6">' +
            '欢迎使用！<br><br>' +
            '<b>录入页</b>：输入批量指令添加 C/P/W/S 单元<br>' +
            '<b>浏览页</b>：查看和搜索字典内容<br>' +
            '<b>文章页</b>：按 C/P 文本组合生成拼接图，支持 # 强制换行<br><br>' +
            '数据自动保存在本地，离线可用。' +
            '</p>' +
            '<div class="actions"><button class="btn btn-primary" id="intro-ok">开始使用</button></div>' +
            '</div>';
        document.body.appendChild(dialog);
        dialog.querySelector('#intro-ok').addEventListener('click', function() {
            dialog.remove();
            localStorage.setItem('dict_app_intro_shown', '1');
        });
    }

    global.DictApp = {
        initData: function() {
            DictStore.ensureDirs();
        },
        search: function(keyword, scope) {
            var results = { units: [], compounds: [], words: [], sentences: [] };
            var kw = keyword.toLowerCase();
            if (!scope) scope = 'all';
            var allowIdMatch = kw.length >= 2;

            function _hitType(matchText, matchDesc) {
                if (matchText && matchDesc) return 'both';
                if (matchText) return 'text';
                if (matchDesc) return 'desc';
                return null;
            }

            var cResult = Queries.getAllUnits();
            for (var i = 0; i < cResult.units.length; i++) {
                var u = cResult.units[i];
                var mt = (u.text && u.text.toLowerCase().indexOf(kw) !== -1) || (allowIdMatch && u.cid && u.cid.toLowerCase().indexOf(kw) !== -1);
                var md = (u.desc && u.desc.toLowerCase().indexOf(kw) !== -1);
                var ht = _hitType(mt, md);
                if (!ht) continue;
                if (scope === 'text' && !mt) continue;
                if (scope === 'desc' && !md) continue;
                u._hitType = ht;
                results.units.push(u);
            }

            var pResult = Queries.getAllCompounds();
            for (var j = 0; j < pResult.compounds.length; j++) {
                var p = pResult.compounds[j];
                var mt2 = (p.text && p.text.toLowerCase().indexOf(kw) !== -1) || (allowIdMatch && p.pid && p.pid.toLowerCase().indexOf(kw) !== -1) || (p.body_text && p.body_text.toLowerCase().indexOf(kw) !== -1);
                var md2 = (p.desc && p.desc.toLowerCase().indexOf(kw) !== -1);
                var ht2 = _hitType(mt2, md2);
                if (!ht2) continue;
                if (scope === 'text' && !mt2) continue;
                if (scope === 'desc' && !md2) continue;
                p._hitType = ht2;
                results.compounds.push(p);
            }

            var wResult = Queries.getAllWords();
            for (var k = 0; k < wResult.words.length; k++) {
                var w = wResult.words[k];
                var mt3 = (w.word && w.word.toLowerCase().indexOf(kw) !== -1) || (allowIdMatch && w.wid && w.wid.toLowerCase().indexOf(kw) !== -1);
                var md3 = (w.desc && w.desc.toLowerCase().indexOf(kw) !== -1);
                var ht3 = _hitType(mt3, md3);
                if (!ht3) continue;
                if (scope === 'text' && !mt3) continue;
                if (scope === 'desc' && !md3) continue;
                w._hitType = ht3;
                results.words.push(w);
            }

            var sResult = Queries.getAllSentences();
            for (var l = 0; l < sResult.sentences.length; l++) {
                var s = sResult.sentences[l];
                var mt4 = (s.preview && s.preview.toLowerCase().indexOf(kw) !== -1) || (allowIdMatch && s.sid && s.sid.toLowerCase().indexOf(kw) !== -1);
                var md4 = (s.desc && s.desc.toLowerCase().indexOf(kw) !== -1);
                var ht4 = _hitType(mt4, md4);
                if (!ht4) continue;
                if (scope === 'text' && !mt4) continue;
                if (scope === 'desc' && !md4) continue;
                s._hitType = ht4;
                results.sentences.push(s);
            }
            return results;
        },
        getStats: function() {
            var index = DictStore.loadIndex();
            var words = DictStore.loadAllWords();
            var sentences = DictStore.loadAllSentences();
            return {
                c_count: (index.base_units || []).length,
                p_count: (index.compounds || []).length,
                w_count: Object.keys(words).length,
                s_count: Object.keys(sentences).length
            };
        },
        showDetail: showDetail,
        hideDetail: hideDetail,
        switchPage: switchPage,
        refreshAll: function() {
            EditPage.updateStats();
            BrowsePage.renderList(true);
        }
    };

    document.addEventListener('DOMContentLoaded', init);

})(window);