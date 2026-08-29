(function(global) {
    'use strict';

    var DictStore = global.DictStore;

    var CANVAS_WIDTH = 1536;
    var CANVAS_HEIGHT = 512;
    var state = null;
    var CURRENT_COLOR = '#000000';
    var COLORS = ['#000000', '#ff0000', '#0000ff', '#00aa00', '#ff8800', '#aa00ff', '#00aaaa', '#888888'];

    function open(unitId, type) {
        var titles = { c: '字符画板', p: '拼音画板', w: '词语画板', s: '句子画板' };
        var title = titles[type] || '画板';

        state = {
            unitId: unitId,
            type: type,
            canvas: null,
            ctx: null,
            overlay: null,
            overlayCtx: null,
            history: [],
            historyIndex: -1,
            isDrawing: false,
            currentTool: 'pen',
            penSize: 18,
            eraserSize: 200,
            lastX: 0,
            lastY: 0,
            mouseX: 0,
            mouseY: 0,
            startX: 0,
            startY: 0,
            cropMode: false,
            title: title,
            cropBackupImage: null,
            cropRect: null
        };

        var modal = document.createElement('div');
        modal.id = 'drawing-modal';
        modal.className = 'drawing-modal';
        modal.innerHTML = _buildModalHTML();
        document.body.appendChild(modal);

        _initCanvas(modal);
        _bindEvents(modal);
        _setActiveTool('pen');

        var existingImg = DictStore.loadImage(unitId);
        if (existingImg) {
            _loadImageToCanvas(existingImg);
        } else {
            _pushHistory();
        }
    }

    function _buildModalHTML() {
        var title = state.title + ' (' + CANVAS_WIDTH + '\u00d7' + CANVAS_HEIGHT + ')';
        var colorsHtml = '';
        for (var i = 0; i < COLORS.length; i++) {
            colorsHtml += '<button class="drawing-color' + (COLORS[i] === CURRENT_COLOR ? ' active' : '') + '" data-color="' + COLORS[i] + '" style="background:' + COLORS[i] + '"></button>';
        }
        var html = '';
        html += '<div class="drawing-overlay"></div>';
        html += '<div class="drawing-container">';
        html += '<div class="drawing-header">';
        html += '<span class="drawing-title">\u270f\ufe0f ' + title + '</span>';
        html += '<button class="drawing-close" id="drawing-close">\u2715</button>';
        html += '</div>';
        html += '<div class="drawing-canvas-wrap">';
        html += '<canvas id="drawing-canvas" width="' + CANVAS_WIDTH + '" height="' + CANVAS_HEIGHT + '"></canvas>';
        html += '<canvas id="drawing-overlay" class="drawing-overlay-canvas" width="' + CANVAS_WIDTH + '" height="' + CANVAS_HEIGHT + '"></canvas>';
        html += '</div>';
        html += '<div class="drawing-tools">';
        html += '<button class="drawing-tool active" id="tool-pen" title="画笔">\u270f\ufe0f<br><small>画笔</small></button>';
        html += '<button class="drawing-tool" id="tool-eraser" title="橡皮擦">\ud83e\uddf9<br><small>橡皮</small></button>';
        html += '<button class="drawing-tool" id="tool-undo" title="撤回">\u21a9\ufe0f<br><small>撤回</small></button>';
        html += '<button class="drawing-tool" id="tool-clear" title="清空">\ud83d\uddd1\ufe0f<br><small>清空</small></button>';
        html += '<button class="drawing-tool" id="tool-crop" title="裁剪">\u2702\ufe0f<br><small>裁剪</small></button>';
        html += '<button class="drawing-tool drawing-save" id="tool-save-full" title="保存整图">\ud83d\udcbe<br><small>保存整图</small></button>';
        html += '<button class="drawing-tool drawing-save" id="tool-save-crop" title="裁剪保存" style="display:none">\u2702\ufe0f<br><small>裁剪保存</small></button>';
        html += '</div>';
        html += '<div class="drawing-colors">';
        html += '<span style="font-size:13px;color:#555;margin-right:6px">颜色:</span>';
        html += colorsHtml;
        html += '</div>';
        html += '<div class="drawing-sliders">';
        html += '<div class="drawing-slider-row">';
        html += '<label>画笔</label>';
        html += '<input type="range" id="pen-size" min="1" max="50" value="18">';
        html += '<span id="pen-size-value">18px</span>';
        html += '</div>';
        html += '<div class="drawing-slider-row">';
        html += '<label>橡皮</label>';
        html += '<input type="range" id="eraser-size" min="1" max="200" value="200">';
        html += '<span id="eraser-size-value">200px</span>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
        return html;
    }

    function _initCanvas(modal) {
        state.canvas = modal.querySelector('#drawing-canvas');
        state.ctx = state.canvas.getContext('2d');
        state.overlay = modal.querySelector('#drawing-overlay');
        state.overlayCtx = state.overlay.getContext('2d');
        state.canvasWrap = modal.querySelector('.drawing-canvas-wrap');

        state.ctx.lineCap = 'round';
        state.ctx.lineJoin = 'round';

        _clearCanvas();
        state.history = [];
        state.historyIndex = -1;
        // 居中显示画布
        state.canvasWrap.scrollLeft = (state.canvasWrap.scrollWidth - state.canvasWrap.clientWidth) / 2;
    }

    function _clearCanvas() {
        state.ctx.fillStyle = '#ffffff';
        state.ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
        state.overlayCtx.clearRect(0, 0, state.overlay.width, state.overlay.height);
        state.cropRect = null;
        state.cropBackupImage = null;
    }

    function _pushHistory() {
        try {
            var snapshot = state.canvas.toDataURL();
            var entry = {
                dataUrl: snapshot,
                cropRect: state.cropRect ? { x: state.cropRect.x, y: state.cropRect.y, w: state.cropRect.w, h: state.cropRect.h } : null
            };
            if (state.historyIndex < state.history.length - 1) {
                state.history = state.history.slice(0, state.historyIndex + 1);
            }
            state.history.push(entry);
            if (state.history.length > 30) {
                state.history.shift();
            }
            state.historyIndex = state.history.length - 1;
        } catch (e) {
            console.warn('保存历史失败:', e);
        }
    }

    function _undo() {
        if (state.history.length <= 1) return;
        if (state.historyIndex > 0) {
            state.historyIndex--;
            var entry = state.history[state.historyIndex];
            state.cropRect = entry.cropRect ? { x: entry.cropRect.x, y: entry.cropRect.y, w: entry.cropRect.w, h: entry.cropRect.h } : null;
            var img = new Image();
            img.onload = function() {
                state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
                state.ctx.drawImage(img, 0, 0);
            };
            img.src = entry.dataUrl;
        }
    }

    function _loadImageToCanvas(dataUrl) {
        var img = new Image();
        img.onload = function() {
            _clearCanvas();
            var iw = img.naturalWidth || img.width;
            var ih = img.naturalHeight || img.height;
            var cw = state.canvas.width;
            var ch = state.canvas.height;
            var dw, dh;
            if (iw <= cw && ih <= ch) {
                dw = iw;
                dh = ih;
            } else {
                var scale = Math.min(cw / iw, ch / ih);
                dw = Math.floor(iw * scale);
                dh = Math.floor(ih * scale);
            }
            var ox = Math.floor((cw - dw) / 2);
            var oy = Math.floor((ch - dh) / 2);
            state.ctx.drawImage(img, ox, oy, dw, dh);
            _pushHistory();
        };
        img.src = dataUrl;
    }

    function _canvasToDataURL() {
        return state.canvas.toDataURL('image/png');
    }

    function _getCanvasPoint(e) {
        var rect = state.canvas.getBoundingClientRect();
        var scaleX = state.canvas.width / rect.width;
        var scaleY = state.canvas.height / rect.height;
        var clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function _clearOverlay() {
        state.overlayCtx.clearRect(0, 0, state.overlay.width, state.overlay.height);
    }

    function _drawEraserIndicator() {
        if (state.cropMode) return;
        if (state.currentTool !== 'eraser') return;
        if (state.isDrawing) return;

        _clearOverlay();
        state.overlayCtx.beginPath();
        state.overlayCtx.arc(state.mouseX, state.mouseY, state.eraserSize / 2, 0, Math.PI * 2);
        state.overlayCtx.strokeStyle = 'rgba(229, 57, 53, 0.6)';
        state.overlayCtx.lineWidth = 2;
        state.overlayCtx.stroke();
        state.overlayCtx.fillStyle = 'rgba(229, 57, 53, 0.1)';
        state.overlayCtx.fill();
    }

    function _drawCropOverlay() {
        if (!state.cropRect) return;
        var cr = state.cropRect;
        _clearOverlay();
        state.overlayCtx.fillStyle = 'rgba(0,0,0,0.2)';
        state.overlayCtx.fillRect(cr.x, cr.y, cr.w, cr.h);
        state.overlayCtx.save();
        state.overlayCtx.strokeStyle = '#e53935';
        state.overlayCtx.lineWidth = 2;
        state.overlayCtx.setLineDash([6, 4]);
        state.overlayCtx.strokeRect(cr.x, cr.y, cr.w, cr.h);
        state.overlayCtx.restore();
    }

    function _saveCanvasBackup() {
        state.cropBackupImage = new Image();
        state.cropBackupImage.src = state.canvas.toDataURL('image/png');
    }

    function _redrawCanvasFromBackup() {
        if (!state.cropBackupImage) return;
        state.ctx.globalCompositeOperation = 'source-over';
        state.ctx.fillStyle = '#ffffff';
        state.ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
        state.ctx.drawImage(state.cropBackupImage, 0, 0);
        state.ctx.strokeStyle = CURRENT_COLOR;
        state.ctx.lineWidth = state.penSize;
    }

    function _startDraw(e) {
        if (state.cropMode) {
            _startCrop(e);
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        state.isDrawing = true;
        var p = _getCanvasPoint(e);
        state.lastX = p.x;
        state.lastY = p.y;
        state.mouseX = p.x;
        state.mouseY = p.y;

        _clearOverlay();

        if (state.currentTool === 'pen') {
            state.ctx.globalCompositeOperation = 'source-over';
            state.ctx.strokeStyle = CURRENT_COLOR;
            state.ctx.lineWidth = state.penSize;
        } else {
            state.ctx.globalCompositeOperation = 'destination-out';
            state.ctx.strokeStyle = 'rgba(0,0,0,1)';
            state.ctx.lineWidth = state.eraserSize;
        }
        state.ctx.lineCap = 'round';
        state.ctx.lineJoin = 'round';

        state.ctx.beginPath();
        state.ctx.moveTo(state.lastX, state.lastY);
        state.ctx.lineTo(state.lastX + 0.1, state.lastY);
        state.ctx.stroke();
    }

    function _moveDraw(e) {
        if (state.cropMode) {
            _moveCrop(e);
            return;
        }
        if (!state.isDrawing) return;
        e.preventDefault();
        e.stopPropagation();
        var p = _getCanvasPoint(e);
        state.ctx.beginPath();
        state.ctx.moveTo(state.lastX, state.lastY);
        state.ctx.lineTo(p.x, p.y);
        state.ctx.stroke();
        state.lastX = p.x;
        state.lastY = p.y;
    }

    function _endDraw(e) {
        if (state.cropMode) {
            _endCrop(e);
            return;
        }
        if (!state.isDrawing) return;
        state.isDrawing = false;
        state.ctx.beginPath();

        _pushHistory();

        if (state.currentTool === 'eraser') {
            _drawEraserIndicator();
        }
    }

    function _startCrop(e) {
        e.preventDefault();
        e.stopPropagation();
        var p = _getCanvasPoint(e);
        state.startX = p.x;
        state.startY = p.y;
        state.mouseX = p.x;
        state.mouseY = p.y;
        state.isDrawing = true;
        _clearOverlay();
        _saveCanvasBackup();
        state.cropRect = null;
    }

    function _moveCrop(e) {
        if (!state.isDrawing) return;
        e.preventDefault();
        e.stopPropagation();
        var p = _getCanvasPoint(e);
        state.mouseX = p.x;
        state.mouseY = p.y;

        var left = Math.min(state.startX, state.mouseX);
        var top = Math.min(state.startY, state.mouseY);
        var w = Math.abs(state.mouseX - state.startX);
        var h = Math.abs(state.mouseY - state.startY);

        _clearOverlay();
        state.overlayCtx.fillStyle = 'rgba(0,0,0,0.2)';
        state.overlayCtx.fillRect(left, top, w, h);
        state.overlayCtx.save();
        state.overlayCtx.strokeStyle = '#e53935';
        state.overlayCtx.lineWidth = 2;
        state.overlayCtx.setLineDash([6, 4]);
        state.overlayCtx.strokeRect(left, top, w, h);
        state.overlayCtx.restore();
    }

    function _endCrop(e) {
        if (!state.isDrawing) return;
        state.isDrawing = false;

        var left = Math.min(state.startX, state.mouseX);
        var top = Math.min(state.startY, state.mouseY);
        var w = Math.abs(state.mouseX - state.startX);
        var h = Math.abs(state.mouseY - state.startY);

        if (w > 10 && h > 10) {
            state.cropRect = { x: left, y: top, w: w, h: h };
            _drawCropOverlay();
            var modal = document.getElementById('drawing-modal');
            if (modal) modal.querySelector('#tool-save-crop').style.display = 'flex';
        } else {
            state.cropRect = null;
            _clearOverlay();
            var modal = document.getElementById('drawing-modal');
            if (modal) modal.querySelector('#tool-save-crop').style.display = 'none';
        }
    }

    function _enterCropMode() {
        state.cropMode = true;
        state.currentTool = 'crop';
        state.isDrawing = false;
        state.cropRect = null;
        _clearOverlay();

        var modal = document.getElementById('drawing-modal');
        if (modal) {
            modal.querySelectorAll('.drawing-tool').forEach(function(btn) {
                btn.classList.remove('active');
            });
            var cropBtn = modal.querySelector('#tool-crop');
            if (cropBtn) cropBtn.classList.add('active');
            modal.querySelector('#tool-save-crop').style.display = 'none';
        }

        state.canvas.style.cursor = 'crosshair';
    }

    function _exitCropMode() {
        state.cropMode = false;
        state.currentTool = 'pen';
        state.isDrawing = false;
        state.cropRect = null;
        _clearOverlay();

        var modal = document.getElementById('drawing-modal');
        if (modal) {
            modal.querySelectorAll('.drawing-tool').forEach(function(btn) {
                btn.classList.remove('active');
            });
            var penBtn = modal.querySelector('#tool-pen');
            if (penBtn) penBtn.classList.add('active');
            modal.querySelector('#tool-save-crop').style.display = 'none';
        }

        state.canvas.style.cursor = 'crosshair';

        if (state.cropBackupImage) {
            _redrawCanvasFromBackup();
            state.cropBackupImage = null;
        }
    }

    function _setActiveTool(tool) {
        state.currentTool = tool;
        state.cropMode = (tool === 'crop');
        var modal = document.getElementById('drawing-modal');
        if (!modal) return;

        modal.querySelectorAll('.drawing-tool').forEach(function(btn) {
            btn.classList.remove('active');
        });
        var toolBtn = modal.querySelector('#tool-' + tool);
        if (toolBtn) toolBtn.classList.add('active');

        state.canvas.style.cursor = 'crosshair';

        if (tool === 'crop') {
            modal.querySelector('#tool-save-crop').style.display = 'none';
            _clearOverlay();
        } else {
            if (state.cropBackupImage) {
                _redrawCanvasFromBackup();
                state.cropBackupImage = null;
            }
            _clearOverlay();
            state.cropRect = null;
            modal.querySelector('#tool-save-crop').style.display = 'none';
            if (tool === 'eraser') {
                _drawEraserIndicator();
            }
        }
    }

    function _saveFull() {
        var dataUrl = _canvasToDataURL();
        var unitId = state.unitId;
        var type = state.type;
        DictStore.saveImage(unitId, dataUrl).then(function() {
            _closeModal();
            if (global.Looseleaf) {
                global.Looseleaf.show(type, unitId);
            }
        }).catch(function(e) {
            console.error('保存图片失败:', e);
            alert('保存失败，请重试');
        });
    }

    function _saveCrop() {
        if (!state.cropRect) return;
        var cr = state.cropRect;
        var tempCanvas = document.createElement('canvas');
        tempCanvas.width = cr.w;
        tempCanvas.height = cr.h;
        var tempCtx = tempCanvas.getContext('2d');
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, cr.w, cr.h);
        tempCtx.drawImage(state.canvas, cr.x, cr.y, cr.w, cr.h, 0, 0, cr.w, cr.h);
        var dataUrl = tempCanvas.toDataURL('image/png');
        var unitId = state.unitId;
        var type = state.type;
        DictStore.saveImage(unitId, dataUrl).then(function() {
            _closeModal();
            if (global.Looseleaf) {
                global.Looseleaf.show(type, unitId);
            }
        }).catch(function(e) {
            console.error('保存裁剪图片失败:', e);
            alert('保存失败，请重试');
        });
    }

    function _closeModal() {
        var modalEl = document.getElementById('drawing-modal');
        if (modalEl) modalEl.remove();
        state = null;
    }

    function _bindEvents(modal) {
        var canvas = state.canvas;

        canvas.addEventListener('mousedown', _startDraw);
        canvas.addEventListener('mousemove', function(e) {
            var p = _getCanvasPoint(e);
            state.mouseX = p.x;
            state.mouseY = p.y;
            _moveDraw(e);
            if (!state.cropMode && state.currentTool === 'eraser' && !state.isDrawing) {
                _drawEraserIndicator();
            }
        });
        canvas.addEventListener('mouseup', _endDraw);
        canvas.addEventListener('mouseleave', function() {
            _endDraw();
            if (!state.cropRect) {
                _clearOverlay();
            }
        });

        canvas.addEventListener('touchstart', function(e) {
            if (e.touches.length > 0) {
                var p = _getCanvasPoint(e);
                state.mouseX = p.x;
                state.mouseY = p.y;
            }
            _startDraw(e);
        }, { passive: false });
        canvas.addEventListener('touchmove', function(e) {
            if (e.touches.length > 0) {
                var p = _getCanvasPoint(e);
                state.mouseX = p.x;
                state.mouseY = p.y;
            }
            _moveDraw(e);
            if (!state.cropMode && state.currentTool === 'eraser' && !state.isDrawing) {
                _drawEraserIndicator();
            }
        }, { passive: false });
        canvas.addEventListener('touchend', function(e) {
            _endDraw(e);
        }, { passive: false });
        canvas.addEventListener('touchcancel', function(e) {
            _endDraw(e);
        }, { passive: false });

        modal.querySelector('#tool-pen').addEventListener('click', function() {
            if (state.cropMode) {
                _exitCropMode();
            }
            _setActiveTool('pen');
        });
        modal.querySelector('#tool-eraser').addEventListener('click', function() {
            if (state.cropMode) {
                _exitCropMode();
            }
            _setActiveTool('eraser');
        });
        modal.querySelector('#tool-undo').addEventListener('click', function() {
            if (state.cropMode) return;
            _undo();
        });
        modal.querySelector('#tool-clear').addEventListener('click', function() {
            if (state.cropMode) {
                _exitCropMode();
            }
            _clearCanvas();
            _pushHistory();
        });
        modal.querySelector('#tool-crop').addEventListener('click', function() {
            if (state.cropMode) {
                _exitCropMode();
            } else {
                _enterCropMode();
            }
        });
        modal.querySelector('#tool-save-full').addEventListener('click', function() { _saveFull(); });
        modal.querySelector('#tool-save-crop').addEventListener('click', function() { _saveCrop(); });

        modal.querySelector('#drawing-close').addEventListener('click', function() {
            if (state && state.history.length > 1) {
                if (!confirm('未保存的修改将丢失，确定关闭？')) return;
            }
            _closeModal();
        });

        modal.querySelector('#pen-size').addEventListener('input', function(e) {
            state.penSize = parseInt(e.target.value, 10);
            state.ctx.lineWidth = state.penSize;
            modal.querySelector('#pen-size-value').textContent = state.penSize + 'px';
        });

        modal.querySelector('#eraser-size').addEventListener('input', function(e) {
            state.eraserSize = parseInt(e.target.value, 10);
            modal.querySelector('#eraser-size-value').textContent = state.eraserSize + 'px';
        });

        modal.querySelectorAll('.drawing-color').forEach(function(btn) {
            btn.addEventListener('click', function() {
                CURRENT_COLOR = btn.dataset.color;
                modal.querySelectorAll('.drawing-color').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
            });
        });
    }

    global.DrawingBoard = {
        open: open
    };

})(typeof window !== 'undefined' ? window : globalThis);