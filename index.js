// Inlined/slightly modified Yahoo serialize-javascript library.
/*
Copyright (c) 2014, Yahoo! Inc. All rights reserved.
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.
*/
function serialize(obj, options) {
    const UID                   = Math.floor(Math.random() * 0x10000000000).toString(16);
    const PLACE_HOLDER_REGEXP   = new RegExp('"@__(F|R|D)-' + UID + '-(\\d+)__@"', 'g');
    const IS_NATIVE_CODE_REGEXP = /\{\s*\[native code\]\s*\}/g;
    const UNSAFE_CHARS_REGEXP   = /[<>\/\u2028\u2029]/g;
    const ESCAPED_CHARS = {
        '<'     : '\\u003C',
        '>'     : '\\u003E',
        '/'     : '\\u002F',
        '\u2028': '\\u2028',
        '\u2029': '\\u2029'
    };
    function escapeUnsafeChars(unsafeChar) {
        return ESCAPED_CHARS[unsafeChar];
    }
    options || (options = {});
    if (typeof options === 'number' || typeof options === 'string') {
        options = {space: options};
    }
    let functions = [];
    let regexps   = [];
    let dates     = [];
    function replacer(key, value) {
        if (!value) {
            return value;
        }
        let origValue = this[key];
        let type = typeof origValue;
        if (type === 'object') {
            if(origValue instanceof RegExp) {
                return '@__R-' + UID + '-' + (regexps.push(origValue) - 1) + '__@';
            }
            if(origValue instanceof Date) {
                return '@__D-' + UID + '-' + (dates.push(origValue) - 1) + '__@';
            }
        }
        if (type === 'function') {
            return '@__F-' + UID + '-' + (functions.push(origValue) - 1) + '__@';
        }
        return value;
    }
    let str;
    if (options.isJSON && !options.space) {
        str = JSON.stringify(obj);
    } else {
        str = JSON.stringify(obj, options.isJSON ? null : replacer, options.space);
    }
    if (typeof str !== 'string') {
        return String(str);
    }
    if (options.unsafe !== true) {
        str = str.replace(UNSAFE_CHARS_REGEXP, escapeUnsafeChars);
    }
    if (functions.length === 0 && regexps.length === 0 && dates.length === 0) {
        return str;
    }
    return str.replace(PLACE_HOLDER_REGEXP, function (match, type, valueIndex) {
        if (type === 'D') {
            return "new Date(\"" + dates[valueIndex].toISOString() + "\")";
        }
        if (type === 'R') {
            return regexps[valueIndex].toString();
        }
        let fn           = functions[valueIndex];
        let serializedFn = fn.toString();
        if (IS_NATIVE_CODE_REGEXP.test(serializedFn)) {
            throw new TypeError('Serializing native function: ' + fn.name);
        }
        return serializedFn;
    });
}

//////////////////////////////////////////
// Original functions for this package  //
//////////////////////////////////////////

// Deserializes our serialized objects.
function deserialize(serializedJavascript){
    return eval('(' + serializedJavascript + ')');
}

// Iterates over argument list to convert to serialized string form
// for use in blob we are constructing.
function strarglist(arglist){
    let ret = '';
    for (let i=0; i<arglist.length; i++){
        if (i === arglist.length - 1){
            ret += "'" + serialize(arglist[i]) + "'"
        }
        else { 
            ret += "'" + serialize(arglist[i]) + "',"
        }
    }
    return ret;
}

// Takes a function and its arguments and returns an object which
// consists of a promise and a web worker (for termination). 
// The promise creates a blob consisting of our serialization functions,
// a try statement to catch errors, a postmessage call to return from our
// worker, a serialization call to serialize the return value call to
// postmessage, a call to an anonymous function which takes our string
// objects as arguments, a mapping of the deserialization of our arguments,
// and a return statement which calls our function with the deserialized
// arguments. The promise resolves when it gets a message from the worker
// which indicates our function has terminated and we have received a return
// value.
function buildThread(fn, ...args){
    let worker;
    return {p: new Promise((resolve, reject) => {
        let b = URL.createObjectURL(new Blob([
            serialize.toString(),
            deserialize.toString(),
            'try {',
            'postMessage(serialize(((...sargs) => {',
                'let args = sargs.map(deserialize);',
                'return (',
                fn.toString(),
                ')(...args);}',
            ')(' + strarglist(args) + ')));',
            '}catch(e){postMessage(undefined);}'
        ], {type:'application/javascript'}));
        worker = new Worker(b);
        URL.revokeObjectURL(b);
        worker.onmessage = e => {
            resolve(deserialize(e.data));
        };
    }), w: worker };
}

// Runs a single function as a worker.
// Takes a function and its arguments and returns a promise which resolves to
// the result.
export function run(fn, ...args){
    // when we do not care about the termination function
    let o = buildThread(fn, ...args)
    return o.p;
}

// Like Promise.all
// Takes an array of arrays of functions and their arguments and
// returns a promise which resolves to an array containing the results
// of running these functions as workers.
export function all(fnargs){
    return Promise.all(fnargs.map(l => run(l[0],...l.slice(1,))));
}

// Like Promise.race
// Takes an array of arrays of functions and their arguments and
// returns a promise which resolves to the first value of the first
// promise which resolves.
export function race(fnargs){
    // Cannot use promise.race because the workers would not stop
    // after the first resolves, we have to terminate them manually.
    return new Promise((resolve, reject) => {
        let ps = [];
        for (let fna of fnargs){
            ps.push(buildThread(fna[0],...fna.slice(1,)));
        }
        // Stop the remaining workers
        for (let i=0; i<ps.length; i++){
            ps[i].p.then(m =>{
                resolve(m);
                for (let pp of ps){
                    pp.w.terminate();
                }
            })
        }
    });
}