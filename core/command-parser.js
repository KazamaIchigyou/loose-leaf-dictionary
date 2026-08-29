/**
 * 命令解析器：解析批量指令文本
 * 对应 Python 版 services/command_parser.py
 *
 * 支持格式: C@内容@描述# P@内容@描述# W@内容@描述# S@内容@描述#
 * 支持换行，指令以 # 结尾
 */
(function(global) {
    'use strict';

    function parseCommands(rawText) {
        if (typeof rawText !== 'string') {
            throw new Error('输入必须是字符串');
        }

        var text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        text = text.replace(/\n/g, '#').trim();
        if (!text) return [];
        if (!text.endsWith('#')) {
            text += '#';
        }

        var parts = text.split('#');
        var commands = [];

        for (var i = 0; i < parts.length; i++) {
            var part = parts[i].trim();
            if (!part) continue;
            if (part.indexOf('@') === -1) {
                throw new Error('无效指令格式（缺少@）: ' + part);
            }

            var atIdx = part.indexOf('@');
            var cmd = part.substring(0, atIdx).trim().toUpperCase();
            var rest = part.substring(atIdx + 1);

            if (['C', 'P', 'W', 'WN', 'S'].indexOf(cmd) === -1) {
                throw new Error('未知指令类型: ' + cmd);
            }

            var body, desc;
            if (rest.indexOf('@') !== -1) {
                var secondAt = rest.indexOf('@');
                body = rest.substring(0, secondAt).trim();
                desc = rest.substring(secondAt + 1).trim();
            } else {
                body = rest.trim();
                desc = '';
            }

            if (!body) {
                throw new Error('指令体不能为空: ' + cmd);
            }

            commands.push([cmd, body, desc]);
        }

        return commands;
    }

    var CommandParser = {
        parseCommands: parseCommands
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = CommandParser;
    } else {
        global.CommandParser = CommandParser;
    }
})(typeof window !== 'undefined' ? window : globalThis);