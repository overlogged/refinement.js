#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var acorn_1 = require("acorn");
var cp = require("child_process");
var fs = require("fs");
var walk = require('acorn/dist/walk');
var tajs_exec = 'bin/tajs-all.jar';
var preload = 'TAJS_makeContextSensitive(__rfjs_res,0);TAJS_makeContextSensitive(__rfjs_wrap,0);function __rfjs_res(y) {TAJS_addContextSensitivity(\'y\');var ret = TAJS_newObject();ret.__rfjs_r = (y == null) ? 0 : function () {return y;};return ret;}function __rfjs_wrap(x) {TAJS_addContextSensitivity(\'x\');if (typeof(x)=="object" && x.__rfjs_r) {return x.__rfjs_r;} else {return function () {return x;}}}';
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
                line: parseInt(arr[1]),
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
        var reserved_fun = ['null', '__rfjs_res', 'undefined'];
        var fun_name = node.callee.name;
        if (fun_name == 'requires') {
            var r1 = { range: node.callee.range, str: 'if(!' };
            var r2 = { range: [node.end, node.end], str: ') return __rfjs_res()' };
            replace_table.push(r1, r2);
        }
        else if (fun_name == 'ensures') {
            var r1 = { range: node.callee.range, str: 'if(!(' };
            var r2 = { range: [node.end, node.end], str: ')(r)) return __rfjs_res()' };
            replace_table.push(r1, r2);
        }
        else if (fun_name == 'assert') {
            var r1 = { range: node.callee.range, str: '(function(){if(!(' };
            var r2 = { range: [node.end, node.end], str: ')) {null();}})()' };
            replace_table.push(r1, r2);
        }
        else if (reserved_fun.filter(function (e) { return e == fun_name; }).length == 0) {
            var r1 = { range: [node.range[0], node.range[0]], str: '__rfjs_wrap(' };
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
        // console.log(exprs);
        var requires_i = 0, ensures_i = exprs.length - 1;
        while (requires_i < exprs.length && is_requires(exprs[requires_i]))
            requires_i++;
        while (ensures_i >= 0 && is_ensures(exprs[ensures_i]))
            ensures_i--;
        if (requires_i != 0 || ensures_i != exprs.length - 1) {
            var main_start = exprs[requires_i].start;
            var main_end = exprs[ensures_i].end;
            var r1 = { range: [main_start, main_start], str: 'var r = (function(){' };
            var r2 = { range: [main_end, main_end], str: '})();' };
            var r3 = {
                range: [node.end - 1, node.end - 1],
                str: 'return __rfjs_res(r);'
            };
            replace_table.push(r1, r2, r3);
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
function transform_js(filename) {
    var check_file = filename + '.rf.js';
    var old_source = fs.readFileSync(filename).toString();
    var replace_table = traverse_code(old_source);
    var new_source = generate_source(replace_table, old_source);
    fs.unlink(check_file, function () { });
    new_source.forEach(function (e) { return fs.appendFileSync(check_file, e); });
    // analysis
    var res = cp.execSync('java -jar ' + tajs_exec + ' ' + check_file + ' ' + flags);
    fs.unlinkSync(check_file);
    console.log(res.toString().trim());
    /*
    let lines = res.toString().split('\n');
  
    // handle the output
    for (let i = 0; i < lines.length; i++) {
      let info = split_tajsinfo(lines[i]);
      if (info && info.filename.search('rfjs-preload.js') == -1) {
        console.log(info.toString());
      }
    }*/
}
// todo: import parser
var flags = process.argv.slice(3).join(' ');
transform_js(process.argv[2]);
