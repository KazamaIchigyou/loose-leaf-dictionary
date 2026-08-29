(function(global) {
    'use strict';

    var DictStore = global.DictStore;
    var Queries = global.Queries;
    var Validators = global.Validators;

    var DEFAULT_LINE_HEIGHT = 120;
    var DEFAULT_MAX_WIDTH = 2048;

    function _loadImageEl(src) {
        return new Promise(function(resolve, reject) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function() { resolve(img); };
            img.onerror = function() { reject(new Error('图片加载失败')); };
            img.src = src;
        });
    }

    function _loadStoredImage(id) {
        var data = DictStore.loadImage(id);
        if (!data) return Promise.reject(new Error(id + ' 图片不存在'));
        return _loadImageEl(data);
    }

    function _textToImage(text, fontSize) {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        ctx.font = fontSize + 'px sans-serif';

        var metrics = ctx.measureText(text);
        var textWidth = metrics.width;
        var textHeight = fontSize * 1.2;

        canvas.width = Math.max(1, Math.ceil(textWidth + 4));
        canvas.height = Math.max(1, Math.ceil(textHeight));

        ctx = canvas.getContext('2d');
        ctx.font = fontSize + 'px sans-serif';
        ctx.fillStyle = '#000';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(text, 2, Math.ceil(textHeight * 0.8));

        return canvas;
    }

    function _resizeCanvasToHeight(canvas, targetHeight) {
        if (canvas.height === targetHeight) return canvas;
        var scale = targetHeight / canvas.height;
        var newWidth = Math.round(canvas.width * scale);

        var newCanvas = document.createElement('canvas');
        newCanvas.width = Math.max(1, newWidth);
        newCanvas.height = Math.max(1, targetHeight);
        var ctx = newCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, newCanvas.width, targetHeight);
        return newCanvas;
    }

    function _canvasToDataUrl(canvas) {
        return canvas.toDataURL('image/png');
    }

    function _imagesToCanvas(images, lineHeight) {
        var totalWidth = 0;
        var maxHeight = 0;
        for (var i = 0; i < images.length; i++) {
            totalWidth += images[i].width;
            if (images[i].height > maxHeight) maxHeight = images[i].height;
        }

        var targetHeight = lineHeight || maxHeight;
        var result = document.createElement('canvas');
        result.width = Math.max(1, totalWidth);
        result.height = Math.max(1, targetHeight);
        var ctx = result.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, result.width, result.height);

        var xOffset = 0;
        for (var j = 0; j < images.length; j++) {
            var img = images[j];
            var yOffset = Math.floor((targetHeight - img.height) / 2);
            ctx.drawImage(img, xOffset, yOffset);
            xOffset += img.width;
        }

        return result;
    }

    function _getCImage(cid, lineHeight) {
        return _loadStoredImage(cid).then(function(img) {
            var canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d').drawImage(img, 0, 0);
            if (lineHeight) canvas = _resizeCanvasToHeight(canvas, lineHeight);
            return { canvas: canvas, error: null };
        }).catch(function() {
            return { canvas: null, error: 'C' + cid + ' 图片缺失' };
        });
    }

    function _getPImage(pid, lineHeight) {
        var imageIndex = DictStore.getImageIndex();

        if (imageIndex[pid]) {
            return _loadStoredImage(pid).then(function(img) {
                var canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                canvas.getContext('2d').drawImage(img, 0, 0);
                if (lineHeight) canvas = _resizeCanvasToHeight(canvas, lineHeight);
                return { canvas: canvas, error: null };
            }).catch(function() {
                return { canvas: null, error: 'P' + pid + ' 图片加载失败' };
            });
        }

        var pData = null;
        try { pData = Queries.getSingleCompound(pid); } catch(e) {}
        if (!pData || pData.error) return Promise.resolve({ canvas: null, error: 'P' + pid + ' 未找到' });

        var cList = pData.c_list || [];
        if (cList.length === 0) return Promise.resolve({ canvas: null, error: 'P' + pid + ' 的 c_list 为空' });

        var tasks = cList.map(function(cid) { return _getCImage(cid, lineHeight); });
        return Promise.all(tasks).then(function(results) {
            for (var i = 0; i < results.length; i++) {
                if (results[i].error) return { canvas: null, error: results[i].error };
            }
            var canvases = results.map(function(r) { return r.canvas; });
            return { canvas: _imagesToCanvas(canvases, lineHeight), error: null };
        });
    }

    function _composeWImage(cList, lineHeight) {
        var tasks = cList.map(function(partId) {
            if (partId.startsWith('P')) {
                return _getPImage(partId, lineHeight);
            } else if (partId.startsWith('C')) {
                return _getCImage(partId, lineHeight);
            } else {
                return Promise.resolve({ canvas: null, error: '未知单元类型: ' + partId });
            }
        });

        return Promise.all(tasks).then(function(results) {
            for (var i = 0; i < results.length; i++) {
                if (results[i].error) return { canvas: null, error: results[i].error };
            }
            var canvases = results.map(function(r) { return r.canvas; });
            return { canvas: _imagesToCanvas(canvases, lineHeight), error: null };
        });
    }

    function _getWImage(wid, lineHeight) {
        // 处理对象格式或JSON数组格式：C/P单元ID列表
        var cList = null;
        if (typeof wid === 'object' && wid !== null) {
            cList = wid.c_list || null;
        } else if (typeof wid === 'string' && wid.charAt(0) === '[') {
            try { cList = JSON.parse(wid); } catch(e) {}
        }
        if (cList && cList.length > 0) return _composeWImage(cList, lineHeight);

        var imageIndex = DictStore.getImageIndex();

        if (imageIndex[wid]) {
            return _loadStoredImage(wid).then(function(img) {
                var canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                canvas.getContext('2d').drawImage(img, 0, 0);
                if (lineHeight) canvas = _resizeCanvasToHeight(canvas, lineHeight);
                return { canvas: canvas, error: null };
            }).catch(function() {
                return { canvas: null, error: 'W' + wid + ' 图片加载失败' };
            });
        }

        var wData = null;
        try { wData = Queries.getSingleWord(wid); } catch(e) {}
        if (!wData || wData.error) return Promise.resolve({ canvas: null, error: 'W' + wid + ' 未找到' });

        var cList = wData.c_list || [];
        if (cList.length === 0) return Promise.resolve({ canvas: null, error: 'W' + wid + ' 的 c_list 为空' });

        return _composeWImage(cList, lineHeight);
    }

    function _composeSentenceImage(sData, lineHeight, maxWidth) {
        lineHeight = lineHeight || DEFAULT_LINE_HEIGHT;
        maxWidth = maxWidth || DEFAULT_MAX_WIDTH;

        var words = sData.words || [];
        var punct = sData.punct || [];

        if (words.length === 0) return Promise.resolve({ canvas: null, error: '句子无单词' });

        var punctMap = {};
        for (var pi = 0; pi < punct.length; pi++) {
            var p = punct[pi];
            if (p.idx > 0 && p.tail) {
                punctMap[p.idx] = p.tail;
            }
        }

        var wordTasks = words.map(function(wid) {
            return _getWImage(wid, lineHeight);
        });

        return Promise.all(wordTasks).then(function(wResults) {
            for (var i = 0; i < wResults.length; i++) {
                if (wResults[i].error) return { canvas: null, error: wResults[i].error };
            }

            var allItems = [];
            for (var j = 0; j < wResults.length; j++) {
                allItems.push({ type: 'image', canvas: wResults[j].canvas });

                var wordIdx = j + 1;
                if (punctMap[wordIdx]) {
                    var punctFontSize = Math.floor(lineHeight * 0.8);
                    var punctCanvas = _textToImage(punctMap[wordIdx], punctFontSize);
                    punctCanvas = _resizeCanvasToHeight(punctCanvas, lineHeight);
                    allItems.push({ type: 'punct', canvas: punctCanvas });
                }
            }

            return _layoutWithWrapping(allItems, lineHeight, maxWidth, []);
        });
    }

    function _composeArticleImage(words, punct, lineHeight, maxWidth, forcedBreaks) {
        lineHeight = lineHeight || DEFAULT_LINE_HEIGHT;
        maxWidth = maxWidth || DEFAULT_MAX_WIDTH;

        var punctMap = {};
        if (punct) {
            for (var pi = 0; pi < punct.length; pi++) {
                var p = punct[pi];
                if (p.idx > 0 && p.tail) {
                    punctMap[p.idx] = p.tail;
                }
            }
        }

        var wordTasks = words.map(function(wid) {
            return _getWImage(wid, lineHeight);
        });

        return Promise.all(wordTasks).then(function(wResults) {
            for (var i = 0; i < wResults.length; i++) {
                if (wResults[i].error) return { canvas: null, error: wResults[i].error };
            }

            var allItems = [];
            for (var j = 0; j < wResults.length; j++) {
                allItems.push({ type: 'image', canvas: wResults[j].canvas });

                var wordIdx = j + 1;
                if (punctMap[wordIdx]) {
                    var punctFontSize = Math.floor(lineHeight * 0.8);
                    var punctCanvas = _textToImage(punctMap[wordIdx], punctFontSize);
                    punctCanvas = _resizeCanvasToHeight(punctCanvas, lineHeight);
                    allItems.push({ type: 'punct', canvas: punctCanvas });
                }
            }

            return _layoutWithWrapping(allItems, lineHeight, maxWidth, forcedBreaks || []);
        });
    }

    function _layoutWithWrapping(items, lineHeight, maxWidth, forcedBreaks) {
        forcedBreaks = forcedBreaks || [];
        var GAP = Math.floor(lineHeight / 3);

        var lines = [];
        var currentLine = [];
        var currentWidth = 0;

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var itemWidth = item.canvas.width;

            if (item.type === 'image' && i < items.length - 1) {
                itemWidth += GAP;
            }

            var isForcedBreak = forcedBreaks.indexOf(i) !== -1;

            if (isForcedBreak || (currentWidth > 0 && currentWidth + itemWidth > maxWidth)) {
                if (currentLine.length > 0) {
                    lines.push(currentLine);
                }
                currentLine = [];
                currentWidth = 0;
            }

            currentLine.push(item);
            currentWidth += itemWidth;
        }

        if (currentLine.length > 0) {
            lines.push(currentLine);
        }

        if (lines.length === 0) {
            return { canvas: null, error: '无内容' };
        }

        var lineWidths = [];
        for (var li = 0; li < lines.length; li++) {
            var lw = 0;
            for (var lj = 0; lj < lines[li].length; lj++) {
                lw += lines[li][lj].canvas.width;
                if (lines[li][lj].type === 'image' && lj < lines[li].length - 1) {
                    lw += GAP;
                }
            }
            lineWidths.push(lw);
        }

        var finalWidth = 0;
        for (var lwi = 0; lwi < lineWidths.length; lwi++) {
            if (lineWidths[lwi] > finalWidth) finalWidth = lineWidths[lwi];
        }
        var finalHeight = lineHeight * lines.length + GAP * (lines.length - 1);

        var result = document.createElement('canvas');
        result.width = Math.max(1, finalWidth);
        result.height = Math.max(1, finalHeight);
        var ctx = result.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, result.width, result.height);

        var yOffset = 0;
        for (var ly = 0; ly < lines.length; ly++) {
            var line = lines[ly];
            var xOffset = 0;
            for (var lx = 0; lx < line.length; lx++) {
                var item = line[lx];
                var yItemOffset = Math.floor((lineHeight - item.canvas.height) / 2);
                ctx.drawImage(item.canvas, xOffset, yOffset + yItemOffset);

                if (item.type === 'image' && lx < line.length - 1) {
                    xOffset += item.canvas.width + GAP;
                } else {
                    xOffset += item.canvas.width;
                }
            }
            yOffset += lineHeight + GAP;
        }

        return { canvas: result, error: null };
    }

    function _buildWordImageFromText(wordText, lineHeight) {
        if (!Validators) return Promise.resolve({ canvas: null, error: 'Validators 未加载' });

        var valid, error, wordInfo;
        try {
            var result = Validators.validate_w(wordText, '');
            valid = result[0];
            error = result[1];
            wordInfo = result[2];
        } catch(e) {
            return Promise.resolve({ canvas: null, error: '解析失败: ' + e.message });
        }

        if (!valid || !wordInfo) {
            return Promise.resolve({ canvas: null, error: error || '无效的单词格式' });
        }

        var cList = wordInfo.c_list || [];
        if (cList.length === 0) {
            return Promise.resolve({ canvas: null, error: '单词内容为空' });
        }

        var cListKey = JSON.stringify(cList);
        var allWords = DictStore.loadAllWords();
        for (var wid in allWords) {
            if (allWords.hasOwnProperty(wid)) {
                var wcList = allWords[wid].c_list;
                if (wcList && JSON.stringify(wcList) === cListKey) {
                    var imageIndex = DictStore.getImageIndex();
                    if (imageIndex[wid]) {
                        return _loadStoredImage(wid).then(function(img) {
                            var canvas = document.createElement('canvas');
                            canvas.width = img.naturalWidth;
                            canvas.height = img.naturalHeight;
                            canvas.getContext('2d').drawImage(img, 0, 0);
                            if (lineHeight) canvas = _resizeCanvasToHeight(canvas, lineHeight);
                            return { canvas: canvas, error: null };
                        }).catch(function() {
                            return _composeWImage(cList, lineHeight);
                        });
                    }
                }
            }
        }

        return _composeWImage(cList, lineHeight);
    }

    function renderArticleFromBody(bodyText, lineHeight, maxWidth) {
        lineHeight = lineHeight || DEFAULT_LINE_HEIGHT;
        maxWidth = maxWidth || DEFAULT_MAX_WIDTH;

        if (!bodyText || !bodyText.trim()) {
            return Promise.resolve({ canvas: null, error: '文章内容为空' });
        }

        var parts = bodyText.trim().split('+');
        var allItems = [];
        var forcedBreaks = [];
        var imageIdx = 0;

        var tasks = [];
        var taskMeta = [];

        for (var i = 0; i < parts.length; i++) {
            var part = parts[i].trim();
            if (!part) continue;

            if (part === '#') {
                forcedBreaks.push(imageIdx);
                continue;
            }

            if (/^[^a-zA-Z0-9\u4e00-\u9fff]+$/.test(part)) {
                tasks.push(Promise.resolve({
                    type: 'punct',
                    text: part,
                    error: null
                }));
                taskMeta.push({ type: 'punct', index: imageIdx });
                imageIdx++;
                continue;
            }

            tasks.push(_buildWordImageFromText(part, lineHeight).then(function(r) {
                return { type: 'image', result: r, error: r.error };
            }));
            taskMeta.push({ type: 'image', index: imageIdx });
            imageIdx++;
        }

        return Promise.all(tasks).then(function(results) {
            var items = [];
            var imgIdx = 0;

            for (var i = 0; i < results.length; i++) {
                var meta = taskMeta[i];
                var r = results[i];

                if (r.error) {
                    return { canvas: null, error: '第' + (i + 1) + '项: ' + r.error };
                }

                if (meta.type === 'punct') {
                    var punctFontSize = Math.floor(lineHeight * 0.8);
                    var punctCanvas = _textToImage(r.text, punctFontSize);
                    punctCanvas = _resizeCanvasToHeight(punctCanvas, lineHeight);
                    items.push({ type: 'punct', canvas: punctCanvas });
                } else {
                    items.push({ type: 'image', canvas: r.result.canvas });
                }
            }

            return _layoutWithWrapping(items, lineHeight, maxWidth, forcedBreaks);
        });
    }

    function renderLevelImage(level, itemId, lineHeight) {
        if (level === 'c') {
            return _getCImage(itemId, lineHeight).then(function(r) {
                if (r.error) return r;
                return { canvas: r.canvas, dataUrl: _canvasToDataUrl(r.canvas), error: null };
            });
        }
        if (level === 'p') {
            return _getPImage(itemId, lineHeight).then(function(r) {
                if (r.error) return r;
                return { canvas: r.canvas, dataUrl: _canvasToDataUrl(r.canvas), error: null };
            });
        }
        if (level === 'w') {
            return _getWImage(itemId, lineHeight).then(function(r) {
                if (r.error) return r;
                return { canvas: r.canvas, dataUrl: _canvasToDataUrl(r.canvas), error: null };
            });
        }
        if (level === 's') {
            var sData = null;
            try { sData = Queries.getSingleSentence(itemId); } catch(e) {}
            if (!sData || sData.error) return Promise.resolve({ canvas: null, error: 'S' + itemId + ' 未找到' });
            return _composeSentenceImage(sData, lineHeight).then(function(r) {
                if (r.error) return r;
                return { canvas: r.canvas, dataUrl: _canvasToDataUrl(r.canvas), error: null };
            });
        }
        return Promise.resolve({ canvas: null, error: '无效层级: ' + level });
    }

    global.ImageComposer = {
        renderLevelImage: renderLevelImage,
        renderArticleFromBody: renderArticleFromBody,
        buildWordImageFromText: _buildWordImageFromText
    };

})(typeof window !== 'undefined' ? window : globalThis);