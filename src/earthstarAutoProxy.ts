import {
    generateAuthorKeypair,
    isErr,
    IStorage,
    StorageMemory,
    ValidatorEs4
} from 'earthstar';
import { log } from './util';

let makeProxy = (storage: IStorage) => {
    let _watchedPaths = new Set<string>();
    let handler = {
        get: function(target: any, prop: any, receiver: any) {
            log('🔷 proxy get:', prop)//;, '=', target[prop]);

            // inject our special added properties
            if (prop === '_watchedPaths') {
                return _watchedPaths;
            }
            if (prop === '_clear') {
                return () => {
                    _watchedPaths.clear();
                };
            }

            // look up a regular property
            let result = target[prop];

            // if it's a function, put a wrapper around it
            // so we can inspect the arguments
            if (typeof result === 'function') {
                result = result.bind(target);
                return (...args: any[]): any => {
                    if (prop === 'getDocument') {
                        let [ path ] = args;
                        log('    observed getDocument with path:', path);
                        _watchedPaths.add(path);
                    }
                    return result(...args);
                }
            } else {
                // it's not a function, just a primitive property,
                // so just return it.
                return result;
            }
        }
    };
    return new Proxy(storage, handler) as IStorage;
}


let main = () => {
    let workspace = '+gardening.abc';
    let keypair = generateAuthorKeypair('test');
    if (isErr(keypair)) { return; }
    let author = keypair.address;
    let storage = new StorageMemory([ValidatorEs4], workspace);

    let proxy = makeProxy(storage);

    log('');
    log('💛 workspace:', proxy.workspace);
    log('');
    log('💛 isClosed:', proxy.isClosed());
    log('');
    log('💛 getDocument:', proxy.getDocument('/hello.txt'));
    log('');
    log('💛 getDocument:', proxy.getDocument('/world.txt'));
    log('');

    let watchedPaths: Set<string> = (proxy as any)._watchedPaths;
    log('🔶 watched paths:', watchedPaths);
    log('');

    (proxy as any)._clear();
    log('🔶 watched paths:', watchedPaths);
    log('');

    storage.close();
};
main();


