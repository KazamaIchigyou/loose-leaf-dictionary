(function(global) {
    'use strict';

    var _cols = parseInt(localStorage.getItem('gallery_cols'), 10) || 4;
    var _minCols = 2;
    var _maxCols = 8;

    function _updateColsDisplay() {
        var num = document.getElementById('gallery-cols-num');
        if (num) num.textContent = _cols;
        var minus = document.getElementById('gallery-cols-minus');
        var plus = document.getElementById('gallery-cols-plus');
        if (minus) minus.style.opacity = _cols <= _minCols ? '0.4' : '';
        if (plus) plus.style.opacity = _cols >= _maxCols ? '0.4' : '';
    }

    function _applyCols() {
        var grid = document.getElementById('gallery-grid');
        if (!grid) return;
        grid.style.gridTemplateColumns = 'repeat(' + _cols + ', 1fr)';
        localStorage.setItem('gallery_cols', _cols);
        _updateColsDisplay();
    }

    function init() {
        var backBtn = document.getElementById('btn-gallery-back');
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                global.DictApp.hideGallery();
            });
        }

        var minus = document.getElementById('gallery-cols-minus');
        var plus = document.getElementById('gallery-cols-plus');
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

    function show() {
        var images = global.DictApp.getAllImages();
        var grid = document.getElementById('gallery-grid');
        var title = document.getElementById('gallery-title');
        if (title) title.textContent = '所有图片 (' + images.length + ')';
        if (!grid) return;

        grid.innerHTML = '';

        if (images.length === 0) {
            grid.innerHTML = '<div class="empty-state">暂无图片</div>';
            return;
        }

        images.forEach(function(img) {
            var card = document.createElement('div');
            card.className = 'gallery-card';
            card.innerHTML = '<img src="' + escapeHtml(img.imgData) + '" alt="' + escapeHtml(img.id) + '">';
            card.addEventListener('click', function() {
                global.DictApp.showDetail(img.type, img.id);
            });
            grid.appendChild(card);
        });

        _applyCols();
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    global.GalleryPage = {
        init: init,
        show: show
    };
})(window);