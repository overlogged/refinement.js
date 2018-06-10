# Refinement.js

Yet another contract library for JavaScript which benefits from static analyzers such as TAJS.

## Installation

At first, you should install `Java`.

Then, do the following steps.

```
git clone https://github.com/NiceKingWei/refinement.js.git
cd refinement.js/
sudo npm install -g
```

After installation, you will get two command line tools, `tajs` and `rfjs`. `tajs` is the backend analyzer of `refinement.js`, if you want to know more about TAJS, please visit [TAJS](http://www.brics.dk/TAJS/). `rfjs` is a compiler that transform specifications into JavaScript code which static analyzer can check it.

## Usage

```
rfjs [OPTION]... [FILE]...
```

#### Options

- `-help` or `--help`
Show help information.

- `-rfjs-debug`
Don't remove the target code after analysis.

Other options will be passed to TAJS.

#### Specifications

- requires: the preconditions of a function
- ensures: the postconditions of a function
- assert: the assertions

Here is an example:
```javascript
function sqrt(x){
    requires(x>=0);
    var ret = Math.sqrt(x);
    assert(ret>=0);
    return ret;
    ensures(function(res)=>{return res>=0;});
}
```

#### Try it now
```
rfjs example/1.js
rfjs example/2.js
rfjs example/3.js
```