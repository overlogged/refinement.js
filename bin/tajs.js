#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var cp = require("child_process");
var cmd = '/usr/bin/java -jar ' + __dirname + '/tajs-all.jar ' + process.argv.slice(2).join(' ');
cp.exec(cmd, function (err, stdout, stderr) {
    if (err) {
        console.log(stdout.trim());
        console.log(stderr.trim());
    }
    else {
        console.log(stdout.trim());
    }
});
