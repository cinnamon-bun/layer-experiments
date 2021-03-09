import {
    generateAuthorKeypair,
    isErr,
    IStorage,
    Query,
    StorageMemory,
    ValidatorEs4,
    WriteEvent
} from 'earthstar';
//import { log } from './util';

//let log = console.log;
let log = (...args: any[]) => {};

type Thunk = () => void;
type Cb = (evt: WriteEvent) => void;
type UnsubFn = Thunk;

/*
 * Make a proxy copy of an IStorage.
 *
 * It looks and acts exactly like a regular storage,
 *  except it remembers every path that we read from it
 *  and every query we do.
 * It lets you subscribe to updates for those docs and queries.
 * In other words, it auto-subscribes based on
 *  your specific access patterns.
 * 
 * You can make multiple proxies for the same storage
 *  and each one will have its own memory of what has been accessed.
 * So you can think of it almost like a cursor,
 *  and use it in a react hook where each component gets
 *  its own proxy instance with its own memory.
 * 
 * Special functionality
 * ---------------------
 * 
 * To call these special functions you have to trick TypeScript
 * with "as any" because they're not normal IStorage functions.
 * 
 * (proxy as any).___clearWatches()
 *      Reset the watched paths and queries back to empty.
 *      You probably want to do this at the beginning of every
 *       React render so that you're only watching the paths
 *       used in the most recent render.
 * 
 * (proxy as any).___subscribe(callback) => unsub()
 *      Subscribe to WriteEvents related to the watched paths
 *       and queries.
 *      This returns an unsubscribe function to cancel
 *       the subscription.
 *      The callback signature is:
 *          callback(evt: WriteEvent) => void
 *      WriteEvent is a type from Earthstar that looks like:
 *           export type WriteEvent = {
 *               kind: 'DOCUMENT_WRITE',
 *               document: Document,
 *               fromSessionId: string,  // which peer gave it to us
 *               isLocal: boolean,  // did we initiate this write ourself?
 *               isLatest: boolean,  // is this the latest doc at this path?
 *           }
 * 
 * (proxy as any).___clearSubscriptions()
 *      Remove all the proxy's subscribers.
 *      (This does not affect the proxy's internal subscription
 *       to the storage's write events)
 * 
 * (proxy as any).___watchedPaths
 * (proxy as any).___watchedDocQueries
 *      These are Sets of the paths and queries that have been
 *       read through this proxy since the last clearWatches().
 *      Normally you don't need to access this directly.
 *      You could manually add and remove things from them
 *       if you wanted to.
 */
export let makeStorageProxy = (storage: IStorage) => {
    // the paths and queries we're watching.
    //   TODO: we could consider caching the query results
    //   to avoid sending too many notifications when the
    //   query results have not actually changed, but that
    //   could use a lot of memory.
    let ___watchedPaths = new Set<string>();
    let ___watchedDocQueries = new Set<Query>();

    // the Proxy handler
    let handler = {
        // when a property is looked up on the proxy object:
        get: function(target: any, prop: any) {
            // target is the storage object
            // prop is a string, the name of the property being accessed

            // look up the property
            let result = target[prop];

            if (typeof result !== 'function') {
                // if it's just a primitive property, just return it.
                log('  🔷 proxy sees property access:', prop);
                return result;
            } else {
                // if it's a function, put a wrapper around it
                // so we can inspect the arguments.
                log('  🔷 proxy sees function access:', prop);
                return (...args: any[]): any => {
                    // notice certain functions...
                    if (prop === 'getDocument' || prop === 'getContent') {
                        // args: (path: string)
                        let path: string = args[0];
                        log('    🔷 observed getDocument() or getContent() with path:', path);
                        ___watchedPaths.add(path);
                    }
                    if (prop === 'documents' || prop === 'contents') {
                        // args: (query?: Query)
                        let query: Query = args[0] || {};
                        log('    🔷 observed documents() or contents() with query:', query);
                        ___watchedDocQueries.add(query);
                    }
                    // TODO: 
                    // more functions to watch
                    // * paths(query: QueryNoLimitBytes)
                    // * authors()
                    return result.bind(target)(...args);
                }
            }
        }
    };
    let proxy = new Proxy(storage, handler);

    // add our special variables and methods to the proxy
    // so we can use them from outside it
    proxy.___watchedPaths = ___watchedPaths;
    proxy.___watchedDocQueries = ___watchedDocQueries;

    proxy.___clearWatches = () => {
        ___watchedPaths.clear();
        ___watchedDocQueries.clear();
    }

    // let users of the proxy subscribe to writeEvents they will care about
    let ___cbs = new Set<Cb>();
    proxy.___subscribe = (cb: any): UnsubFn => {
        ___cbs.add(cb);
        return () => ___cbs.delete(cb);
    }
    proxy.___clearSubscriptions = () => {
        ___cbs.clear();
    }

    // subscribe the proxy itself to WriteEvents from Earthstar
    let unsubFromStorage = storage.onWrite.subscribe((evt: WriteEvent) => {
        // We've gotten a write event.  Do we care about it?
        // Filter the events to only the docs and queries we're watching.
        let shouldRunCallbacks = false;

        // Easy to check for specific paths we're watching...
        if (___watchedPaths.has(evt.document.path)) {
            shouldRunCallbacks = true;
        }

        // Hard to check if the event fits any of our watched queries.
        // We want to do something like this:
        //      for (let query of ___watchedDocQueries) {
        //          if (queryMatchesDoc(query, evt.document)) {
        //              shouldRunCallbacks = true;
        //          }
        //      }
        // But we also need to test if the old version of the doc
        //  that was overwritten matched the query, so we know when
        //  a doc is leaving the set of query results.
        // And if the query has certain non-local selectors we can't
        //  figure it out just by looking at one doc at a time.
        // (Those non-local selectors are historyMode, limit, and limitBytes.)
        // So we need to first make WriteEvents include the previous
        //  version that was being overwritten, and then we need to check
        //  for those non-local selectors.

        // Instead, for now, we just have to conservatively assume
        // that any document write MIGHT match any query:
        if (___watchedDocQueries.size > 0) {
            shouldRunCallbacks = true;
        }

        // Run the callbacks
        if (shouldRunCallbacks) {
            for (let cb of ___cbs) {
                cb(evt);
            }
        }
    });

    // When the storage closes, shut down this proxy object too.
    storage.onWillClose.subscribe(() => {
        proxy.___clearSubscriptions();
        proxy.___clearWatches();
        unsubFromStorage();
    });

    return proxy as IStorage;
}

//==============================================================================
// a verbose test function

let test = () => {
    let workspace = '+gardening.abc';
    let keypair = generateAuthorKeypair('test');
    if (isErr(keypair)) { return; }
    let author = keypair.address;
    let storage = new StorageMemory([ValidatorEs4], workspace);

    let proxy = makeStorageProxy(storage);

    log('');
    log('💛 workspace:', proxy.workspace);
    log('');
    log('💛 isClosed:', proxy.isClosed());
    log('');
    log('💛 set:', proxy.set(keypair, {
        format: 'es.4',
        path: '/hello-world.txt',
        content: 'hello world',
    }));
    log('');
    log('💛 getDocument:', proxy.getDocument('/hello-world.txt'));
    log('');
    log('💛 getDocument:', proxy.getDocument('/does-not-exist.txt'));
    log('');
    log('💛 documents:', proxy.documents({pathEndsWith: '.txt'}));
    log('');

    let watchedPaths: Set<string> = (proxy as any).___watchedPaths;
    let watchedDocQueries: Set<Query> = (proxy as any).___watchedDocQueries;
    log('  🔶 watched paths:', watchedPaths);
    log('  🔶 watched doc queries:', watchedDocQueries);
    log('');

    log('💛 about to ___subscribe(cb)...');
    (proxy as any).___subscribe((evt: WriteEvent) => {
        log('🎉 proxy is sending an event out to its subscribers:');
        log(evt);
    });
    log('');

    log('💛 set again:', proxy.set(keypair, {
        format: 'es.4',
        path: '/hello-world.txt',
        content: 'hello world again',
    }));
    log('');

    log('💛 about to ___clearWatches()...');
    (proxy as any).___clearWatches();
    log('  🔶 watched paths:', watchedPaths);
    log('  🔶 watched doc queries:', watchedDocQueries);
    log('');

    log('💛 about to ___clearSubscriptions()...');
    (proxy as any).___clearSubscriptions();
    log('');

    storage.close();
};
//test();
