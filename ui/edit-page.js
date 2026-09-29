(function(global) {
    'use strict';

    var DictStore = global.DictStore;
    var CommandParser = global.CommandParser;
    var Operations = global.Operations;
    var Queries = global.Queries;

    var templates = {
        C: 'C@@#',
        P: 'P@@#',
        W: 'W@@#',
        WN: 'WN@@#',
        S: 'S@@#',
        SEP_UNDER: '_',
        SEP_SLASH: '/',
        SEP_PLUS: '+'
    };

    var searchScope = 'text';

    function escapeHtml(str) {
        if (str == null) return '';
        str = String(str);
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function _hitBadge(hitType) {
        if (searchScope !== 'all') return '';
        if (!hitType) return '';
        if (hitType === 'both') return '<span class="hit-tag both">正文+释义</span>';
        if (hitType === 'text') return '<span class="hit-tag text">正文命中</span>';
        if (hitType === 'desc') return '<span class="hit-tag desc">释义命中</span>';
        return '';
    }

    function init() {
        document.addEventListener('click', function(e) {
            var scopeBtn = e.target.closest('.scope-btn');
            if (scopeBtn && scopeBtn.dataset.scope) {
                searchScope = scopeBtn.dataset.scope;
                var all = document.querySelectorAll('#edit-search-scope .scope-btn');
                all.forEach(function(b) { b.classList.toggle('active', b === scopeBtn); });
                var si = document.getElementById('edit-search');
                if (si) onSearch({ target: si });
                return;
            }

            var tplBtn = e.target.closest('.tpl-btn');
            if (tplBtn && tplBtn.dataset.tpl) {
                var tpl = templates[tplBtn.dataset.tpl];
                if (!tpl) return;
                var input = document.getElementById('command-input');
                if (!input) return;
                var isSep = tplBtn.dataset.sep === '1';
                if (isSep) {
                    _insertAtCursor(input, tpl);
                } else {
                    if (input.value && !input.value.endsWith('\n')) input.value += '\n';
                    input.value += tpl;
                }
                input.focus();
                return;
            }
        });

        var executeBtn = document.getElementById('btn-execute');
        if (executeBtn) {
            executeBtn.addEventListener('click', onExecute);
        }

        var searchInput = document.getElementById('edit-search');
        if (searchInput) {
            searchInput.addEventListener('input', onSearch);
        }

        var exportBtn = document.getElementById('btn-export');
        if (exportBtn) {
            exportBtn.addEventListener('click', onExport);
        }

        var importBtn = document.getElementById('btn-import');
        if (importBtn) {
            importBtn.addEventListener('click', function() {
                var fileInput = document.getElementById('import-file');
                if (fileInput) fileInput.click();
            });
        }

        var importFile = document.getElementById('import-file');
        if (importFile) {
            importFile.addEventListener('change', onImport);
        }

        var resetBtn = document.getElementById('btn-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                if (!confirm('⚠️ 确认清空所有数据？\n\n此操作将删除所有 C/P/W/S 条目及绘画图片，数据不可恢复。\n建议先导出备份。')) return;
                if (!confirm('再次确认：真的要清空所有数据吗？')) return;
                global.DictStore.reset().then(function() {
                    location.reload();
                }).catch(function(e) {
                    alert('清空失败: ' + (e.message || e));
                });
            });
        }

        var checkBtn = document.getElementById('btn-check-update');
        if (checkBtn) {
            checkBtn.addEventListener('click', onCheckUpdate);
        }

        var imgStatBox = document.getElementById('stat-img-box');
        if (imgStatBox) {
            imgStatBox.addEventListener('click', function() {
                global.DictApp.showGallery();
            });
        }
    }

    document.addEventListener('click', function(e) {
            var applyBtn = e.target.closest('#btn-apply-update');
            if (applyBtn) {
                var latest = applyBtn.dataset.version || '';
                if (applyBtn.disabled) return;
                applyBtn.disabled = true;
                applyBtn.textContent = '正在应用更新...';
                applyBtn.style.opacity = '0.6';
                _setUpdateStatus('当前版本：<b style="color:#333">v' + escapeHtml(_getCurVersion()) + '</b><br>' +
                    '<span style="color:#1565c0">正在应用更新 v' + escapeHtml(latest) + '，请稍候...</span>');
                try { _doApplyUpdate(latest); } catch(err) {
                    console.error('更新失败:', err);
                    _setUpdateStatus('当前版本：<b style="color:#333">v' + escapeHtml(_getCurVersion()) + '</b><br>' +
                        '<span style="color:#c62828">更新失败：' + escapeHtml(err.message || '未知错误') + '</span>');
                }
            }
        });

    function _getCurVersion() {
        var v = null;
        try { v = localStorage.getItem('dict_app_installed_version'); } catch(e) {}
        if (!v && window.DICT_APP_CURRENT_VERSION) v = window.DICT_APP_CURRENT_VERSION;
        return v || '未知';
    }

    function _setUpdateStatus(html) {
        var el = document.getElementById('update-status');
        if (el) el.innerHTML = html;
    }

    function _refreshVersionDisplay() {
        var cur = _getCurVersion();
        _setUpdateStatus('当前版本：<b style="color:#333">v' + escapeHtml(cur) + '</b><br>最新版本：<span id="update-latest">正在查询服务器...</span>');
        setTimeout(function() { onCheckUpdate(true); }, 80);
    }

    function onCheckUpdate(auto) {
        auto = !!auto;
        if (!auto) {
            _setUpdateStatus('当前版本：<b style="color:#333">v' + escapeHtml(_getCurVersion()) + '</b><br>最新版本：<span style="color:#888">正在查询服务器...</span>');
        }
        if (location.protocol === 'file:') {
            _setUpdateStatus('当前版本：<b style="color:#333">v' + escapeHtml(_getCurVersion()) + '</b><br><span style="color:#e65100">当前是本地文件环境（file://），无法检查更新<br>请部署到 HTTPS 网站后再使用此功能</span>');
            if (!auto) showToast('本地文件环境无法检查更新');
            return;
        }
        var url = './version.json?t=' + Date.now();
        fetch(url, { cache: 'no-store' }).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function(data) {
            if (!data || !data.version) throw new Error('版本数据格式错误');
            var latest = String(data.version);
            var cur = _getCurVersion();
            var latestEl = document.getElementById('update-latest');
            if (latestEl) {
                latestEl.innerHTML = latest === cur
                    ? '<span style="color:#2e7d32">v' + escapeHtml(latest) + '（已是最新）</span>'
                    : '<span style="color:#c62828">v' + escapeHtml(latest) + '（可用更新）</span>';
            }
            if (latest === cur) {
                _setUpdateStatus('当前版本：<b style="color:#333">v' + escapeHtml(cur) + '</b><br>' +
                    '<span style="color:#2e7d32">最新版本：v' + escapeHtml(latest) + '（已是最新）</span>');
                if (!auto) showToast('已是最新版本');
            } else {
                _setUpdateStatus(
                    '当前版本：<b style="color:#333">v' + escapeHtml(cur) + '</b><br>' +
                    '<span style="color:#c62828">最新版本：v' + escapeHtml(latest) + '（有新版本）</span><br><br>' +
                    '<button id="btn-apply-update" data-version="' + escapeHtml(latest) + '" class="btn btn-primary" style="margin-top:4px">立即更新到 v' + escapeHtml(latest) + '</button>'
                );
                if (!auto) showToast('发现新版本 v' + latest);
            }
        }).catch(function(err) {
            _setUpdateStatus('当前版本：<b style="color:#333">v' + escapeHtml(_getCurVersion()) + '</b><br><span style="color:#c62828">查询失败：' + escapeHtml(err.message || '网络错误') + '</span>');
        });
    }

    function _doApplyUpdate(latestVersion) {
        if (!('serviceWorker' in navigator)) {
            try { localStorage.setItem('dict_app_installed_version', latestVersion); } catch(e) {}
            window.location.reload(true);
            return;
        }
        navigator.serviceWorker.ready.then(function(reg) {
            try { localStorage.setItem('dict_app_installed_version', latestVersion); } catch(e) {}
            if (reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                showToast('正在应用更新...');
                setTimeout(function() { window.location.reload(true); }, 800);
            } else {
                reg.update().then(function() {
                    if (reg.waiting) {
                        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                        showToast('正在应用更新...');
                        setTimeout(function() { window.location.reload(true); }, 800);
                    } else {
                        showToast('更新文件已下载，即将重新加载...');
                        setTimeout(function() { window.location.reload(true); }, 1200);
                    }
                }).catch(function() {
                    window.location.reload(true);
                });
            }
        }).catch(function() {
            try { localStorage.setItem('dict_app_installed_version', latestVersion); } catch(e) {}
            window.location.reload(true);
        });
    }

    function onExecute() {
        var input = document.getElementById('command-input');
        var text = input.value.trim();
        if (!text) {
            alert('请输入指令');
            return;
        }

        var resultsDiv = document.getElementById('command-results');
        resultsDiv.innerHTML = '';

        try {
            var commands = CommandParser.parseCommands(text);
            var results = Operations.processAllCommands(commands);

            var successCount = 0;
            var failCount = 0;

            results.forEach(function(r) {
                var item = document.createElement('div');
                item.className = 'result-item';

                if (r.result.success) {
                    successCount++;
                    item.innerHTML =
                        '<div class="result-status success">✅ ' + r.type + ' ' + r.result.message + '</div>' +
                        '<div class="result-body">' + r.type + '@' + r.body + '</div>';
                } else {
                    failCount++;
                    item.innerHTML =
                        '<div class="result-status error">❌ ' + r.type + ' ' + r.result.error + '</div>' +
                        '<div class="result-body">' + r.type + '@' + r.body + '</div>';
                }
                resultsDiv.appendChild(item);
            });

            if (successCount > 0) {
                input.value = '';
            }

            updateStats();

            if (failCount === 0) {
                showToast('全部成功！新增 ' + successCount + ' 条');
            } else {
                showToast('完成: ' + successCount + ' 成功, ' + failCount + ' 失败');
            }

        } catch (err) {
            resultsDiv.innerHTML = '<div class="result-status error">❌ 解析错误: ' + err.message + '</div>';
        }
    }

    function onSearch(e) {
        var keyword = e.target.value.trim();
        var resultsDiv = document.getElementById('command-results');
        resultsDiv.innerHTML = '';

        if (!keyword) {
            resultsDiv.innerHTML = '<div class="empty-state">输入关键词搜索已有内容</div>';
            return;
        }

        var results = global.DictApp.search(keyword, searchScope);
        var count = 0;

        results.units.forEach(function(u) {
            count++;
            var item = document.createElement('div');
            item.className = 'result-item';
            item.innerHTML = '<span class="badge badge-c">C</span> ' + (u.text || '(无文本)') +
                ' <span class="tag">' + u.cid + '</span>' + _hitBadge(u._hitType) +
                (u.desc ? ' <span style="color:#888;font-size:12px">' + u.desc + '</span>' : '');
            item.addEventListener('click', function() {
                global.DictApp.showDetail('c', u.cid);
            });
            resultsDiv.appendChild(item);
        });

        results.compounds.forEach(function(p) {
            count++;
            var item = document.createElement('div');
            item.className = 'result-item';
            var meta = p.desc || '';
            if (p.body_text) meta += (meta ? '  ' : '') + '[' + p.body_text + ']';
            item.innerHTML = '<span class="badge badge-p">P</span> ' + (p.text || '(无文本)') +
                ' <span class="tag">' + p.pid + '</span>' + _hitBadge(p._hitType) +
                (meta ? ' <span style="color:#888;font-size:12px">' + meta + '</span>' : '');
            item.addEventListener('click', function() {
                global.DictApp.showDetail('p', p.pid);
            });
            resultsDiv.appendChild(item);
        });

        results.words.forEach(function(w) {
            count++;
            var item = document.createElement('div');
            item.className = 'result-item';
            item.innerHTML = '<span class="badge badge-w">W</span> ' + w.word +
                ' <span class="tag">' + w.wid + '</span>' + _hitBadge(w._hitType) +
                (w.desc ? ' <span style="color:#888;font-size:12px">' + w.desc + '</span>' : '');
            item.addEventListener('click', function() {
                global.DictApp.showDetail('w', w.wid);
            });
            resultsDiv.appendChild(item);
        });

        results.sentences.forEach(function(s) {
            count++;
            var item = document.createElement('div');
            item.className = 'result-item';
            item.innerHTML = '<span class="badge badge-s">S</span> ' + s.preview +
                ' <span class="tag">' + s.sid + '</span>' + _hitBadge(s._hitType) +
                (s.desc ? ' <span style="color:#888;font-size:12px">' + s.desc + '</span>' : '');
            item.addEventListener('click', function() {
                global.DictApp.showDetail('s', s.sid);
            });
            resultsDiv.appendChild(item);
        });

        if (count === 0) {
            resultsDiv.innerHTML = '<div class="empty-state">未找到匹配 "' + keyword + '" 的内容</div>';
        }
    }

    function updateStats() {
        var stats = global.DictApp.getStats();
        var el = document.getElementById('app-stats');
        if (el) {
            el.textContent = 'C:' + stats.c_count + ' P:' + stats.p_count +
                ' W:' + stats.w_count + ' S:' + stats.s_count;
        }
        var stc = document.getElementById('st-c');
        var stp = document.getElementById('st-p');
        var stw = document.getElementById('st-w');
        var sts = document.getElementById('st-s');
        var stimg = document.getElementById('st-img');
        if (stc) stc.textContent = stats.c_count;
        if (stp) stp.textContent = stats.p_count;
        if (stw) stw.textContent = stats.w_count;
        if (sts) sts.textContent = stats.s_count;
        if (stimg) stimg.textContent = stats.img_count;
        _refreshVersionDisplay();
    }

    function onExport() {
        if (!global.ExportImport) {
            showToast('导出模块未加载');
            return;
        }
        try {
            var result = global.ExportImport.downloadExport();
            var stats = global.DictApp.getStats();
            showToast('已导出: C' + stats.c_count + ' P' + stats.p_count +
                ' W' + stats.w_count + ' S' + stats.s_count);
        } catch (err) {
            alert('导出失败: ' + err.message);
        }
    }

    function onImport(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!global.ExportImport) {
            showToast('导入模块未加载');
            return;
        }

        _showImportDialog(file);
    }

    function _showImportDialog(file) {
        var mask = document.createElement('div');
        mask.className = 'confirm-dialog';
        mask.innerHTML =
            '<div class="dialog" style="min-width:280px">' +
                '<h3>选择导入模式</h3>' +
                '<p style="font-size:13px;color:#666;line-height:1.6;margin-bottom:12px">文件：' + escapeHtml(file.name.substring(0, 40)) + (file.name.length > 40 ? '...' : '') +
                '　大小：' + _formatSize(file.size) + '</p>' +
                '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">' +
                    '<label style="display:flex;gap:8px;align-items:flex-start;padding:10px;border:1.5px solid #2196f3;border-radius:8px;background:#e3f2fd;cursor:pointer">' +
                        '<input type="radio" name="importMode" value="merge" checked style="margin-top:2px">' +
                        '<div style="flex:1">' +
                            '<div style="font-weight:600;color:#1565c0">叠加导入（推荐）</div>' +
                            '<div style="font-size:12px;color:#666;margin-top:2px">保留当前所有数据<br>ID 相同的条目会被导入的覆盖</div>' +
                        '</div>' +
                    '</label>' +
                    '<label style="display:flex;gap:8px;align-items:flex-start;padding:10px;border:1.5px solid #e0e0e0;border-radius:8px;cursor:pointer">' +
                        '<input type="radio" name="importMode" value="replace" style="margin-top:2px">' +
                        '<div style="flex:1">' +
                            '<div style="font-weight:600;color:#c62828">覆盖导入</div>' +
                            '<div style="font-size:12px;color:#666;margin-top:2px">先清空当前所有 C/P/W/S 和图片<br>完全以导入文件为准</div>' +
                        '</div>' +
                    '</label>' +
                '</div>' +
                '<div class="actions" style="justify-content:flex-end;gap:8px">' +
                    '<button class="btn btn-secondary" id="import-cancel">取消</button>' +
                    '<button class="btn btn-primary" id="import-ok">开始导入</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(mask);

        function _remove() { try { mask.remove(); } catch(e) {} }

        var radios = mask.querySelectorAll('input[name="importMode"]');
        radios.forEach(function(r) {
            r.addEventListener('change', function() {
                var allLabels = mask.querySelectorAll('label');
                allLabels.forEach(function(lab) {
                    var rad = lab.querySelector('input[type="radio"]');
                    var checked = rad && rad.checked;
                    lab.style.borderColor = checked ? '#2196f3' : '#e0e0e0';
                    lab.style.background = checked ? '#e3f2fd' : '#fff';
                });
            });
        });

        mask.querySelector('#import-cancel').addEventListener('click', function() {
            var importFile = document.getElementById('import-file');
            if (importFile) importFile.value = '';
            _remove();
        });

        mask.querySelector('#import-ok').addEventListener('click', function() {
            var selected = 'merge';
            radios.forEach(function(r) { if (r.checked) selected = r.value; });

            if (selected === 'replace') {
                if (!confirm('⚠️ 确认使用「覆盖导入」？\n\n当前所有 C / P / W / S 条目和绘画图片将被先清空再导入，不可恢复！')) {
                    return;
                }
            }

            _remove();
            showToast('开始导入...');

            global.ExportImport.handleImportFile(file, selected).then(function(result) {
                var modeText = result.mode === 'replace' ? '【覆盖模式】' : '【叠加模式】';
                showToast(modeText + '导入成功: ' +
                    result.words + ' W, ' +
                    result.compounds + ' P, ' +
                    result.sentences + ' S, ' +
                    result.images + ' 图片');
                var importFile = document.getElementById('import-file');
                if (importFile) importFile.value = '';
                updateStats();
            }).catch(function(err) {
                alert('导入失败: ' + err.message);
                var importFile = document.getElementById('import-file');
                if (importFile) importFile.value = '';
            });
        });
    }

    function _formatSize(bytes) {
        if (!bytes) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }

    function _insertAtCursor(input, text) {
        if (!input) return;
        var start = input.selectionStart || 0;
        var end = input.selectionEnd || 0;
        var before = input.value.substring(0, start);
        var after = input.value.substring(end);
        input.value = before + text + after;
        var pos = start + text.length;
        try {
            input.focus();
            input.setSelectionRange(pos, pos);
        } catch (e) {
            input.focus();
        }
    }

    function showToast(msg) {
        var toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:#fff;padding:10px 20px;border-radius:6px;z-index:200;font-size:14px;';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(function() { toast.remove(); }, 2000);
    }

    global.EditPage = {
        init: init,
        updateStats: updateStats,
        _injectToast: showToast
    };
})(window);