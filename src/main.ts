#!/usr/bin/env node
import {parse} from 'acorn';
import * as cp from 'child_process';
import * as fs from 'fs';

const walk = require('acorn/dist/walk');

let tajs_exec = 'tajs -quiet';
const preload =
    'TAJS_makeContextSensitive(__rfjs_wrap,0);function __rfjs_null(){var ret=TAJS_newObject();ret.__rfjs_r=0;return ret;}function __rfjs_res(y){TAJS_addContextSensitivity("y");var ret=TAJS_newObject();ret.__rfjs_r=function(){return y};return ret}function __rfjs_wrap(x){TAJS_addContextSensitivity("x");if(typeof x=="object"&&x.__rfjs_r){return x.__rfjs_r}else{return function(){return x}}};\n';

let rfjs_debug = false;


function split_tajsinfo(str: string) {
  let arr = str.split(':');
  if (arr.length >= 2) {
    let new_filename = arr[0];
    let end = new_filename.search('.rf.js');
    if (end != -1) new_filename = new_filename.substr(0, end);
    if (arr.length == 4) {
      return {
        filename: new_filename,
        line: parseInt(arr[1]) - 1,
        column: parseInt(arr[2]),
        info: arr[3].substring(1),
        toString: function() {
          return [
            this.filename, ':', this.line, ':', this.column, ': ', this.info
          ].join('');
        }
      };
    } else {
      return {
        filename: new_filename,
        info: arr[1].substring(1),
        toString: function() {
          return this.filename + ':' + this.info;
        }
      };
    }
  }
}

class ReplaceItem {
  range: number[];
  str: string;
}

/**
 * traverse ast and produce replace table
 */
function traverse_code(old_source: string) {
  let ast = parse(old_source, {ranges: true});
  let replace_table: ReplaceItem[] = [{range: [0, 0], str: preload}];

  // CallExpression
  function handle_call(node: any, state: Object, c: Function) {
    let reserved_fun = ['null', '__rfjs_res', '__rfjs_null', 'undefined'];
    let fun_name = node.callee.name;
    if (fun_name == 'requires') {
      let r1 = {range: node.callee.range, str: 'if(!'};
      let r2 = {range: [node.end, node.end], str: ') return __rfjs_null()'};
      replace_table.push(r1, r2);
    } else if (fun_name == 'ensures') {
      let r1 = {range: node.callee.range, str: 'if(!('};
      let r2 = {range: [node.end, node.end], str: ')(r)) return __rfjs_null()'};
      replace_table.push(r1, r2);
    } else if (fun_name == 'assert') {
      let r1 = {range: node.callee.range, str: '(function(){if(!('};
      let r2 = {range: [node.end, node.end], str: ')) {null();}})()'};
      replace_table.push(r1, r2);
    } else if (reserved_fun.filter(e => e == fun_name).length == 0) {
      let args = node.arguments.length;
      let sensitivity = '';
      // if (fun_name && args > 0) {
      //   for (let i = 1; i <= args; i++) {
      //     sensitivity +=
      //         'TAJS_makeContextSensitive(' + fun_name + ',' + i + ');';
      //   }
      // }
      let r1 = {
        range: [node.range[0], node.range[0]],
        str: sensitivity + '__rfjs_wrap('
      };
      let r2 = {range: [node.end, node.end], str: ')()'};
      replace_table.push(r1, r2);
    }

    // recursive
    if (node.callee) c(node.callee, state);
    if (node.arguments) {
      node.arguments.forEach((e: Node) => {
        c(e, state);
      });
    }
  }

  // FunctionExpression FunctionDeclaration ArrowFunctionExpression
  function handle_fun(node: any, state: Object, c: Function) {
    // judge if an expression is a specification
    function is_spec(spec: string) {
      return function(expr: any) {
        if (expr && expr.type == 'ExpressionStatement') {
          let call_expr = expr.expression;
          if (call_expr && call_expr.type == 'CallExpression') {
            let first_fun = call_expr.callee.name;
            if (first_fun == spec) {
              return true;
            }
          }
        }
        return false;
      };
    }
    let is_requires = is_spec('requires');
    let is_ensures = is_spec('ensures');

    // judge if it is a function with specifications
    let exprs = node.body.body;
    let len = exprs.length;

    let requires_i = 0, ensures_i = len - 1;
    while (requires_i < len && is_requires(exprs[requires_i])) requires_i++;
    while (ensures_i >= 0 && is_ensures(exprs[ensures_i])) ensures_i--;

    if (requires_i != 0 || ensures_i != len - 1) {
      let main_start =
          requires_i == len ? exprs[len - 1].end : exprs[requires_i].start;
      let main_end = ensures_i == -1 ? exprs[0].start : exprs[ensures_i].end;

      if (main_start == main_end) {
        let r1 = {
          range: [node.end - 1, node.end - 1],
          str: 'return __rfjs_res(undefined);'
        };
        replace_table.push(r1);
      } else {
        let r1 = {
          range: [node.end - 1, node.end - 1],
          str: 'return __rfjs_res(r);'
        };
        let r2 = {range: [main_start, main_start], str: 'var r = (function(){'};
        let r3 = {range: [main_end, main_end], str: '})();'};
        replace_table.push(r1, r2, r3);
      }
    }

    let args = node.params.length;
    let fun_name = node.id ? node.id.name : undefined;
    let sensitivity = '';
    if (fun_name && args > 0) {
      for (let i = 1; i <= args; i++) {
        sensitivity += 'TAJS_makeContextSensitive(' + fun_name + ',' + i + ');';
      }
      replace_table.push({range: [node.end, node.end], str: sensitivity});
    }

    // recursive
    if (node.id) c(node.id, state);
    if (node.body) c(node.body, state);
    if (node.params) {
      node.params.forEach((e: Node) => c(e, state));
    }
  }

  walk.recursive(ast, {}, {
    CallExpression: handle_call,
    FunctionDeclaration: handle_fun,
    FunctionExpression: handle_fun,
    ArrowFunctionExpression: handle_fun
  });

  return replace_table.sort((a, b) => a.range[0] - b.range[0]);
}

/**
 * using replace table to transform old_source to new_source
 */
function generate_source(replace_table: ReplaceItem[], old_source: string) {
  let index = 0;
  let new_source: string[] = [];
  let length = old_source.length;
  for (let i in replace_table) {
    let {range, str} = replace_table[i];
    new_source.push(old_source.substring(index, range[0]));
    new_source.push(str);
    index = range[1];
  }
  return new_source;
}


/**
 * transform js code
 */
function transform_js(filename: string) {
  let check_file = filename + '.rf.js';
  let old_source = fs.readFileSync(filename).toString();
  let replace_table = traverse_code(old_source);
  var new_source = generate_source(replace_table, old_source);
  fs.unlink(check_file, function() {});
  new_source.forEach((e: string) => fs.appendFileSync(check_file, e));
}


/**
 * analysis
 */
function analysis(files: string[], flags: string[]) {
  let res =
      cp.execSync(tajs_exec + ' ' + files.join(' ') + ' ' + flags.join(' '));

  console.log(tajs_exec + ' ' + files.map(e=>e+'.rf.js').join(' ') + ' ' + flags.join(' '));
  console.log(files, flags);
  if(!rfjs_debug) files.forEach(e => fs.unlinkSync(e + '.rf.js'));

  let lines = res.toString().split('\n');

  // handle the output
  for (let i = 0; i < lines.length; i++) {
    let info = split_tajsinfo(lines[i]);
    if (info && (info.line == undefined || info.line != 0)) {
      console.log(info.toString());
    }
  }
}

function main() {
  let args = process.argv.slice(2);
  let flags: string[] = [];
  let files: string[] = [];
  args.forEach((e: string) => {
    if (e == '-rfjs-debug') {
      rfjs_debug = true;
    } else if (e[0] == '-') {
      flags.push(e);
    } else {
      files.push(e);
    }
  });

  files.forEach(file => transform_js(file));
  analysis(files, flags);
}

main();