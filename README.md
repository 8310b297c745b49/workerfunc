# workerfunc
Run a limited subset of Javascript functions as web workers with an intuitive promise-based interface.
# Usage
```javascript
import * as wf from 'workerfunc';

// Our test function.
const f = (a, b) => {
    for (let i = 0; i < 10000000000; i++){
        let r = i/2;
    };
    return a + b;
};

// Run our single function f as a worker with args 1234, 1234.
wf.run(f, 1234, 1234).then(m => {
    console.log(m);
});

// Race three functions as workers in parallel.
// The first function to finish resolves the promise and terminates the rest.
wf.race([
    [f, 100, 100],
    [f, 200, 200],
    [f, 300, 300]
]).then(m => {
    console.log(m);
});

// Wait for three functions run as workers in parallel to finish.
// The result is an array containing the returned values.
wf.all([
    [f, 1, 1],
    [f, 1, 1],
    [f, 1, 1]
]).then(m => {
    console.log(m);
});
```
# Limitations
* This was tested exclusively on the browser.
* Functions cannot have contexts or additional properties.
* Functions must take and return objects which are serializable with [serialize-javascript](https://github.com/yahoo/serialize-javascript)
* Closures, scopes, all slightly broken due to serialization and the nature of this insane hack. Use caution.
* Functions will never throw errors and return undefined if they do. The promises will thus never throw errors.
* This package is an insane hack. There are other limitations the extent of which are unknown, mostly due to the subtle and dangerous nature of Javascript.
* This package needs tests.
# License
This package uses the Yahoo! Inc. BSD license as it inlines/modifies their entire [serialize-javascript](https://github.com/yahoo/serialize-javascript) package.