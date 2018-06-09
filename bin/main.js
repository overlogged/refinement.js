#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var acorn_1 = require("acorn");
var cp = require("child_process");
var fs = require("fs");
var walk = require('acorn/dist/walk');
var tajs_exec = 'tajs -quiet';
var preload = 'TAJS_makeContextSensitive(__rfjs_wrap,0);function __rfjs_null(){var ret=TAJS_newObject();ret.__rfjs_r=0;return ret;}function __rfjs_res(y){TAJS_addContextSensitivity("y");var ret=TAJS_newObject();ret.__rfjs_r=function(){return y};return ret}function __rfjs_wrap(x){TAJS_addContextSensitivity("x");if(typeof x=="object"&&x.__rfjs_r){return x.__rfjs_r}else{return function(){return x}}};\n';
var rfjs_debug = false;
function split_tajsinfo(str) {
    var arr = str.split(':');
    if (arr.length >= 2) {
        var new_filename = arr[0];
        var end = new_filename.search('.rf.js');
        if (end != -1)
            new_filename = new_filename.substr(0, end);
        if (arr.length == 4) {
            return {
                filename: new_filename,
                line: parseInt(arr[1]) - 1,
                column: parseInt(arr[2]),
                info: arr[3].substring(1),
                toString: function () {
                    return [
                        this.filename, ':', this.line, ':', this.column, ': ', this.info
                    ].join('');
                }
            };
        }
        else {
            return {
                filename: new_filename,
                info: arr[1].substring(1),
                toString: function () {
                    return this.filename + ':' + this.info;
                }
            };
        }
    }
}
var ReplaceItem = /** @class */ (function () {
    function ReplaceItem() {
    }
    return ReplaceItem;
}());
/**
 * traverse ast and produce replace table
 */
function traverse_code(old_source) {
    var ast = acorn_1.parse(old_source, { ranges: true });
    var replace_table = [{ range: [0, 0], str: preload }];
    // CallExpression
    function handle_call(node, state, c) {
        var reserved_fun = ['null', '__rfjs_res', '__rfjs_null', 'undefined'];
        var fun_name = node.callee.name;
        if (fun_name == 'requires') {
            var r1 = { range: node.callee.range, str: 'if(!' };
            var r2 = { range: [node.end, node.end], str: ') return __rfjs_null()' };
            replace_table.push(r1, r2);
        }
        else if (fun_name == 'ensures') {
            var r1 = { range: node.callee.range, str: 'if(!(' };
            var r2 = { range: [node.end, node.end], str: ')(r)) return __rfjs_null()' };
            replace_table.push(r1, r2);
        }
        else if (fun_name == 'assert') {
            var r1 = { range: node.callee.range, str: '(function(){if(!(' };
            var r2 = { range: [node.end, node.end], str: ')) {null();}})()' };
            replace_table.push(r1, r2);
        }
        else if (reserved_fun.filter(function (e) { return e == fun_name; }).length == 0) {
            var args = node.arguments.length;
            var sensitivity = '';
            // if (fun_name && args > 0) {
            //   for (let i = 1; i <= args; i++) {
            //     sensitivity +=
            //         'TAJS_makeContextSensitive(' + fun_name + ',' + i + ');';
            //   }
            // }
            var r1 = {
                range: [node.range[0], node.range[0]],
                str: sensitivity + '__rfjs_wrap('
            };
            var r2 = { range: [node.end, node.end], str: ')()' };
            replace_table.push(r1, r2);
        }
        // recursive
        if (node.callee)
            c(node.callee, state);
        if (node.arguments) {
            node.arguments.forEach(function (e) {
                c(e, state);
            });
        }
    }
    // FunctionExpression FunctionDeclaration ArrowFunctionExpression
    function handle_fun(node, state, c) {
        // judge if an expression is a specification
        function is_spec(spec) {
            return function (expr) {
                if (expr && expr.type == 'ExpressionStatement') {
                    var call_expr = expr.expression;
                    if (call_expr && call_expr.type == 'CallExpression') {
                        var first_fun = call_expr.callee.name;
                        if (first_fun == spec) {
                            return true;
                        }
                    }
                }
                return false;
            };
        }
        var is_requires = is_spec('requires');
        var is_ensures = is_spec('ensures');
        // judge if it is a function with specifications
        var exprs = node.body.body;
        var len = exprs.length;
        var requires_i = 0, ensures_i = len - 1;
        while (requires_i < len && is_requires(exprs[requires_i]))
            requires_i++;
        while (ensures_i >= 0 && is_ensures(exprs[ensures_i]))
            ensures_i--;
        if (requires_i != 0 || ensures_i != len - 1) {
            var main_start = requires_i == len ? exprs[len - 1].end : exprs[requires_i].start;
            var main_end = ensures_i == -1 ? exprs[0].start : exprs[ensures_i].end;
            if (main_start == main_end) {
                var r1 = {
                    range: [node.end - 1, node.end - 1],
                    str: 'return __rfjs_res(undefined);'
                };
                replace_table.push(r1);
            }
            else {
                var r1 = {
                    range: [node.end - 1, node.end - 1],
                    str: 'return __rfjs_res(r);'
                };
                var r2 = { range: [main_start, main_start], str: 'var r = (function(){' };
                var r3 = { range: [main_end, main_end], str: '})();' };
                replace_table.push(r1, r2, r3);
            }
        }
        var args = node.params.length;
        var fun_name = node.id ? node.id.name : undefined;
        var sensitivity = '';
        if (fun_name && args > 0) {
            for (var i = 1; i <= args; i++) {
                sensitivity += 'TAJS_makeContextSensitive(' + fun_name + ',' + i + ');';
            }
            replace_table.push({ range: [node.end, node.end], str: sensitivity });
        }
        // recursive
        if (node.id)
            c(node.id, state);
        if (node.body)
            c(node.body, state);
        if (node.params) {
            node.params.forEach(function (e) { return c(e, state); });
        }
    }
    walk.recursive(ast, {}, {
        CallExpression: handle_call,
        FunctionDeclaration: handle_fun,
        FunctionExpression: handle_fun,
        ArrowFunctionExpression: handle_fun
    });
    return replace_table.sort(function (a, b) { return a.range[0] - b.range[0]; });
}
/**
 * using replace table to transform old_source to new_source
 */
function generate_source(replace_table, old_source) {
    var index = 0;
    var new_source = [];
    var length = old_source.length;
    for (var i in replace_table) {
        var _a = replace_table[i], range = _a.range, str = _a.str;
        new_source.push(old_source.substring(index, range[0]));
        new_source.push(str);
        index = range[1];
    }
    return new_source;
}
/**
 * transform js code
 */
function transform_js(filename) {
    var check_file = filename + '.rf.js';
    var old_source = fs.readFileSync(filename).toString();
    var replace_table = traverse_code(old_source);
    var new_source = generate_source(replace_table, old_source);
    fs.unlink(check_file, function () { });
    new_source.forEach(function (e) { return fs.appendFileSync(check_file, e); });
}
/**
 * analysis
 */
function analysis(files, flags) {
    var res = cp.execSync(tajs_exec + ' ' + files.join(' ') + ' ' + flags.join(' '));
    console.log(tajs_exec + ' ' + files.map(function (e) { return e + '.rf.js'; }).join(' ') + ' ' + flags.join(' '));
    console.log(files, flags);
    if (!rfjs_debug)
        files.forEach(function (e) { return fs.unlinkSync(e + '.rf.js'); });
    var lines = res.toString().split('\n');
    // handle the output
    for (var i = 0; i < lines.length; i++) {
        var info = split_tajsinfo(lines[i]);
        if (info && (info.line == undefined || info.line != 0)) {
            console.log(info.toString());
        }
    }
}
function main() {
    var args = process.argv.slice(2);
    var flags = [];
    var files = [];
    args.forEach(function (e) {
        if (e == '-rfjs-debug') {
            rfjs_debug = true;
        }
        else if (e[0] == '-') {
            flags.push(e);
        }
        else {
            files.push(e);
        }
    });
    files.forEach(function (file) { return transform_js(file); });
    analysis(files, flags);
}
main();
