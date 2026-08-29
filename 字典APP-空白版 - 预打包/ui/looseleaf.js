(function(global) {
    'use strict';

    var Queries = global.Queries;
    var Updates = global.Updates;
    var DictStore = global.DictStore;

    var TYPE_CONFIG = {
        c: { title: 'C单元', color: '#1565c0', hasImage: true, coreLabel: '字', canGenerate: false },
        p: { title: 'P复合字根', color: '#7b1fa2', hasImage: true, coreLabel: '文本', canGenerate: true },
        w: { title: 'W单词', color: '#2e7d32', hasImage: true, coreLabel: '文本', canGenerate: true },
        s: { title: 'S句子', color: '#e65100', hasImage: true, coreLabel: '预览', canGenerate: true }
    };

    function init() {
    }

    function _refText(type, id) {
        try {
            if (type === 'c') { var r = Queries.getSingleUnit(id); return r.error ? id : (r.text || id); }
            if (type === 'p') { var r2 = Queries.getSingleCompound(id); return r2.error ? id : (r2.text || id); }
            if (type === 'w') { var r3 = Queries.getSingleWord(id); return r3.error ? id : (r3.word || id); }
            if (type === 's') { var r4 = Queries.getSingleSentence(id); return r4.error ? id : (r4.preview || id); }
        } catch(e) {}
        return id;
    }

    function _getDetail(type, id) {
        if (type === 'c') return Queries.getSingleUnit(id);
        if (type === 'p') return Queries.getSingleCompound(id);
        if (type === 'w') return Queries.getSingleWord(id);
        if (type === 's') return Queries.getSingleSentence(id);
        return { error: '未知类型: ' + type };
    }

    function _buildCommandText(type, detail) {
        if (!detail) return '';
        var head = '';
        var body = '';
        var desc = detail.desc || '';
        if (type === 'c') {
            head = 'C';
            body = detail.text || '';
        } else if (type === 'p') {
            head = 'P';
            body = detail.body_text || '';
        } else if (type === 'w') {
            head = 'W';
            body = detail.body_text || ((detail.c_texts || []).map(function(ct) { return ct.text || ''; }).join('/'));
        } else if (type === 's') {
            head = 'S';
            body = detail.body_text || '';
        }
        return head + '@' + body + '@' + desc + '#';
    }

    function _copyToClipboard(text) {
        if (!text) { alert('没有可复制的内容'); return Promise.resolve(false); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(function() { return true; }).catch(function() { return _fallbackCopy(text); });
        }
        return Promise.resolve(_fallbackCopy(text));
    }

    function _fallbackCopy(text) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '0';
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand('copy'); } catch(e) { ok = false; }
            document.body.removeChild(ta);
            if (!ok) {
                prompt('请手动复制下方录入代码：', text);
            }
            return ok;
        } catch(e) {
            prompt('请手动复制下方录入代码：', text);
            return false;
        }
    }

    function show(type, id) {
        var page = document.getElementById('page-detail');
        page.classList.add('active');
        document.getElementById('page-edit').classList.remove('active');
        document.getElementById('page-browse').classList.remove('active');
        document.getElementById('page-article').classList.remove('active');

        var container = document.getElementById('detail-content');
        container.innerHTML = '';

        renderUnit(type, id, container);
    }

    function renderUnit(type, id, container) {
        var cfg = TYPE_CONFIG[type];
        if (!cfg) { container.innerHTML = '<div class="empty-state">未知类型</div>'; return; }

        var detail = _getDetail(type, id);
        if (detail.error) { container.innerHTML = '<div class="empty-state">' + detail.error + '</div>'; return; }

        var html = '<h3 style="margin-bottom:12px;color:' + cfg.color + ';">' + cfg.title + '</h3>';

        html += renderCoreField(type, detail, cfg);

        var compHtml = renderComposition(type, detail);
        if (compHtml) html += compHtml;

        html += '<div class="detail-row"><div class="label">描述</div><div class="value">' + escapeHtml(detail.desc || '') + '</div></div>';

        html += '<div class="divider"></div>';
        html += '<div class="toolbar">';
        html += '<button class="btn btn-secondary btn-sm" id="btn-edit-desc">编辑描述</button>';
        html += '<button class="btn btn-secondary btn-sm" id="btn-copy-command">复制录入代码</button>';
        if (type === 'c') {
            html += '<button class="btn btn-secondary btn-sm" id="btn-edit-text">修改字</button>';
        } else if (type === 'p' || type === 'w' || type === 's') {
            html += '<button class="btn btn-secondary btn-sm" id="btn-edit-list">修改组成</button>';
            html += '<button class="btn btn-danger btn-sm" id="btn-delete">删除</button>';
        }
        html += '</div>';

        if (cfg.hasImage) {
            html += renderImageBlock(id, type, cfg.canGenerate);
        }

        container.innerHTML = html;
        bindDetailActions(container, type, id, detail);
        if (cfg.hasImage) {
            bindImageActions(container, type, id);
        }
    }

    function renderCoreField(type, detail, cfg) {
        var value = '';
        if (type === 'c') {
            value = '<span class="color-block" style="background:#e3f2fd">' + escapeHtml(detail.text) + '</span>';
        } else if (type === 'p') {
            value = escapeHtml(detail.text);
        } else if (type === 'w') {
            value = escapeHtml(detail.word) + ' (词义' + detail.meaning_seq + ')';
        } else if (type === 's') {
            value = '<span style="font-size:18px;color:#333">' + escapeHtml(detail.preview) + '</span>';
        }
        return '<div class="detail-row"><div class="label">' + cfg.coreLabel + '</div><div class="value">' + value + '</div></div>';
    }

    function renderComposition(type, detail) {
        if (type === 'c') return '';

        if (type === 'p') {
            var html = '<div class="detail-row"><div class="label">组成</div><div class="value">';
            if (detail.c_list && detail.c_list.length > 0) {
                detail.c_list.forEach(function(cid, ci) {
                    if (ci > 0) html += '<span class="sep-underscore">_</span>';
                    html += '<button class="link-btn badge-c" data-jump="c" data-id="' + cid + '">' + escapeHtml(_refText('c', cid)) + '</button>';
                });
            }
            html += '</div></div>';
            return html;
        }

        if (type === 'w') {
            var html2 = '<div class="detail-row"><div class="label">组成</div><div class="value">';
            if (detail.c_texts && detail.c_texts.length > 0) {
                detail.c_texts.forEach(function(ct, ci) {
                    if (ci > 0) html2 += '<span class="sep-slash">/</span>';
                    var tagClass = ct.is_compound ? 'badge-p' : 'badge-c';
                    var jType = ct.is_compound ? 'p' : 'c';
                    var btnText = ct.is_compound ? (ct.body_text || ct.text) : ct.text;
                    html2 += '<button class="link-btn ' + tagClass + '" data-jump="' + jType + '" data-id="' + ct.id + '">' + escapeHtml(btnText) + '</button>';
                });
            }
            html2 += '</div></div>';
            return html2;
        }

        if (type === 's') {
            var html3 = '<div class="detail-row"><div class="label">单词</div><div class="value">';
            var punctMap = {};
            (detail.punct || []).forEach(function(p) { punctMap[p.idx] = p.tail; });
            detail.words.forEach(function(wid, i) {
                if (i > 0) html3 += '<span class="sep-plus"> + </span>';
                if (typeof wid === 'object' && wid !== null && wid.c_list) {
                    var parts = wid.c_list.map(function(cpid) {
                        var r = Queries.getSingleUnit(cpid);
                        if (r.error) {
                            var r2 = Queries.getSingleCompound(cpid);
                            return r2.error ? '?' : r2.text;
                        }
                        return r.text;
                    });
                    html3 += '<span class="badge-cp">' + escapeHtml(parts.join('/')) + '</span> ';
                } else {
                    var wBody = Queries.getSingleWord(wid);
                    var wBodyText = (!wBody.error && wBody.body_text) ? wBody.body_text : _refText('w', wid);
                    html3 += '<button class="link-btn badge-c" data-jump="w" data-id="' + wid + '">' + escapeHtml(wBodyText) + '</button> ';
                }
                if (punctMap[i + 1] !== undefined) {
                    html3 += '<span class="punct">' + escapeHtml(punctMap[i + 1]) + '</span>';
                }
            });
            html3 += '</div></div>';
            return html3;
        }

        return '';
    }

    function bindDetailActions(container, type, id, detail) {
        container.querySelectorAll('[data-jump]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var jType = btn.dataset.jump;
                var jId = btn.dataset.id;
                global.DictApp.showDetail(jType, jId);
            });
        });

        var editDescBtn = container.querySelector('#btn-edit-desc');
        if (editDescBtn) {
            editDescBtn.addEventListener('click', function() {
                var currentDesc = detail.desc || '';
                var newDesc = prompt('输入新的描述:', currentDesc);
                if (newDesc === null) return;
                newDesc = newDesc.trim();

                var result;
                if (type === 'c') result = Updates.updateCDesc(id, newDesc);
                else if (type === 'p') result = Updates.updatePDesc(id, newDesc);
                else if (type === 'w') result = Updates.updateWordDesc(id, newDesc);
                else if (type === 's') result = Updates.updateSentenceDesc(id, newDesc);

                if (result.error) alert('修改失败: ' + result.error);
                else { show(type, id); global.EditPage.updateStats(); }
            });
        }

        var copyBtn = container.querySelector('#btn-copy-command');
        if (copyBtn) {
            copyBtn.addEventListener('click', function() {
                var cmd = _buildCommandText(type, detail);
                _copyToClipboard(cmd).then(function(ok) {
                    if (ok) {
                        try {
                            var EditPage = global.EditPage;
                            if (EditPage && EditPage._injectToast !== undefined) {
                                EditPage._injectToast('录入代码已复制');
                            } else {
                                alert('已复制录入代码：\n\n' + cmd);
                            }
                        } catch(e) {
                            alert('已复制录入代码：\n\n' + cmd);
                        }
                    } else {
                        alert('复制失败，已弹出手动复制框');
                    }
                });
            });
        }

        var editTextBtn = container.querySelector('#btn-edit-text');
        if (editTextBtn) {
            editTextBtn.addEventListener('click', function() {
                var currentText = detail.text;
                var newText = prompt('输入新的字:', currentText);
                if (newText === null) return;
                newText = newText.trim();
                var result = Updates.updateCText(id, newText);
                if (result.error) alert('修改失败: ' + result.error);
                else { show(type, id); global.EditPage.updateStats(); }
            });
        }

        var editListBtn = container.querySelector('#btn-edit-list');
        if (editListBtn) {
            editListBtn.addEventListener('click', function() {
                if (type === 'p') {
                    var currentBody = detail.body_text;
                    var newBody = prompt('输入新的组成（如：字_字）:', currentBody);
                    if (newBody === null) return;
                    var result = Updates.updatePList(id, newBody);
                    if (result.error) alert('修改失败: ' + result.error);
                    else if (result.confirm_needed) {
                        if (confirm(result.message)) {
                            Updates.confirmWListUpdate(id, result.c_list, result.display_text);
                        }
                    } else { show(type, id); global.EditPage.updateStats(); }
                } else if (type === 'w') {
                    var cTexts = (detail.c_texts || []).map(function(ct) { return ct.text; });
                    var currentBody = cTexts.join('/');
                    var newBody = prompt('输入新的组成（如：字/字_字）:', currentBody);
                    if (newBody === null) return;
                    var result = Updates.updateWList(id, newBody);
                    if (result.error) alert('修改失败: ' + result.error);
                    else if (result.confirm_needed) {
                        if (confirm(result.message)) {
                            Updates.confirmWListUpdate(id, result.c_list, result.display_text);
                        }
                    } else { show(type, id); global.EditPage.updateStats(); }
                } else if (type === 's') {
                    var currentBody2 = detail.body_text || '';
                    var newBody2 = prompt('输入新的句子（如：单词+单词+标点）:', currentBody2);
                    if (newBody2 === null) return;
                    var result2 = Updates.updateSList(id, newBody2);
                    if (result2.error) alert('修改失败: ' + result2.error);
                    else { show(type, id); global.EditPage.updateStats(); }
                }
            });
        }

        var deleteBtn = container.querySelector('#btn-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function() {
                var confirmMsg = '确定删除这个' + type.toUpperCase() + '单元吗？';
                if (type === 'p') {
                    var check = Updates.checkDeleteP(id);
                    if (check.error) { alert(check.error); return; }
                    if (!check.can_delete) {
                        if (!confirm(check.message + '，强制删除将可能破坏数据，确定继续吗？')) return;
                    }
                } else if (type === 'w') {
                    var check = Updates.checkDeleteW(id);
                    if (check.error) { alert(check.error); return; }
                    if (!check.can_delete) {
                        if (!confirm(check.message + '，强制删除将可能破坏数据，确定继续吗？')) return;
                    }
                }
                if (!confirm(confirmMsg)) return;

                var result;
                if (type === 'p') result = Updates.deleteP(id);
                else if (type === 'w') result = Updates.deleteW(id);
                else if (type === 's') result = Updates.deleteS(id);

                if (result.error) alert('删除失败: ' + result.error);
                else { global.DictApp.hideDetail(); global.EditPage.updateStats(); global.BrowsePage.renderList(true); }
            });
        }
    }

    function renderImageBlock(unitId, type, canGenerate) {
        var imageIndex = DictStore.getImageIndex();
        var hasStoredImg = !!imageIndex[unitId];
        var html = '';
        html += '<div class="image-block" id="img-block-' + unitId + '">';
        html += '<div class="image-actions">';
        html += '<button class="btn btn-secondary btn-sm" data-img-upload="' + unitId + '">上传图片</button>';
        html += '<button class="btn btn-secondary btn-sm" data-img-draw="' + unitId + ':' + type + '">✏️ 画板</button>';
        if (canGenerate) {
            html += '<button class="btn btn-primary btn-sm" data-img-generate="' + type + ':' + unitId + '">生成拼接图</button>';
        }
        if (hasStoredImg) {
            html += '<button class="btn btn-danger btn-sm" data-img-delete="' + unitId + '">删除图片</button>';
        }
        html += '<input type="file" accept="image/*" id="img-upload-' + unitId + '" style="display:none">';
        html += '</div>';
        html += '<div class="image-container" id="img-container-' + unitId + '">';
        if (hasStoredImg) {
            var imgData = DictStore.loadImage(unitId);
            html += '<img src="' + escapeHtml(imgData) + '" alt="' + escapeHtml(unitId) + '" class="detail-image" onclick="window.DrawingBoard.open(\'' + unitId + '\', \'' + type + '\')">';
        } else if (canGenerate) {
            html += '<div class="image-empty" id="img-empty-' + unitId + '">暂无图片，点击上方按钮生成</div>';
        } else {
            html += '<div class="image-empty">暂无图片</div>';
        }
        html += '</div>';
        html += '</div>';
        return html;
    }

    function bindImageActions(container, type, id) {
        container.querySelectorAll('[data-img-upload]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var unitId = btn.dataset.imgUpload;
                var fileInput = container.querySelector('#img-upload-' + unitId);
                if (fileInput) {
                    fileInput.onchange = function(e) {
                        var file = e.target.files[0];
                        if (!file) return;
                        var reader = new FileReader();
                        reader.onload = function(ev) {
                            var dataUrl = ev.target.result;
                            DictStore.saveImage(unitId, dataUrl);
                            show(type, id);
                        };
                        reader.readAsDataURL(file);
                    };
                    fileInput.click();
                }
            });
        });

        container.querySelectorAll('[data-img-draw]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var parts = btn.dataset.imgDraw.split(':');
                var unitId = parts[0];
                var unitType = parts[1];
                global.DrawingBoard.open(unitId, unitType);
            });
        });

        container.querySelectorAll('[data-img-delete]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var unitId = btn.dataset.imgDelete;
                if (!confirm('确定删除该图片吗？')) return;
                DictStore.deleteImage(unitId);
                show(type, id);
            });
        });

        container.querySelectorAll('[data-img-generate]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var parts = btn.dataset.imgGenerate.split(':');
                var gType = parts[0];
                var gId = parts[1];
                var container2 = document.getElementById('img-container-' + gId);
                if (container2) {
                    container2.innerHTML = '<div class="image-empty">正在生成...</div>';
                }
                global.ImageComposer.renderLevelImage(gType, gId).then(function(result) {
                    if (result.error) {
                        if (container2) {
                            container2.innerHTML = '<div class="image-empty" style="color:#c0392b">生成失败: ' + escapeHtml(result.error) + '</div>';
                        }
                        return;
                    }
                    if (container2 && result.dataUrl) {
                        container2.innerHTML = '<img src="' + escapeHtml(result.dataUrl) + '" alt="拼接图" class="detail-image" onclick="window.open(this.src)">';
                    }
                }).catch(function(err) {
                    if (container2) {
                        container2.innerHTML = '<div class="image-empty" style="color:#c0392b">生成失败: ' + escapeHtml(err.message) + '</div>';
                    }
                });
            });
        });
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    global.Looseleaf = {
        init: init,
        show: show
    };
})(window);