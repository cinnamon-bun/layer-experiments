import t = require('tap');
//t.runOnly = true;

import {
    generateAuthorKeypair,
    isErr,
    Query,
    StorageMemory,
    ValidatorEs4,
    WriteEvent
} from 'earthstar';
import { makeStorageProxy } from '../earthstarAutoProxy';

t.test('earthstar auto proxy: documents', (t: any) => {
    // set up earthstar
    let workspace = '+gardening.abc';
    let keypair = generateAuthorKeypair('test');
    if (isErr(keypair)) { return; }
    let storage = new StorageMemory([ValidatorEs4], workspace);

    let proxy = makeStorageProxy(storage);

    let ___watchedPaths: Set<string> = (proxy as any).___watchedPaths;
    let ___watchedDocQueries: Set<Query> = (proxy as any).___watchedDocQueries;

    // we'll collect all the write events here
    let events: WriteEvent[] = [];

    // subscribe
    let unsub = (proxy as any).___subscribe((evt: WriteEvent) => {
        events.push(evt);
    });

    // read some stuff
    // this will auto-subscribe us to these docs
    proxy.getDocument('/apple.txt');
    proxy.getContent('/banana.txt');

    t.same(___watchedPaths.size, 2, 'we are now watching two paths');

    // write a doc
    // this will trigger the subscription
    proxy.set(keypair, {
        format: 'es.4',
        path: '/apple.txt',
        content: 'APPLE',
    });

    // this will not trigger the subscription
    // because we never tried to read it
    proxy.set(keypair, {
        format: 'es.4',
        path: '/potato.txt',
        content: 'POTATO',
    });

    t.same(events.length, 1, 'one event should have occurred');
    t.same(events[0].document.path, '/apple.txt', 'correct doc came in subscription');

    unsub();

    // write a doc
    // but now we have unsubscribed
    proxy.set(keypair, {
        format: 'es.4',
        path: '/apple.txt',
        content: 'APPLE',
    });

    t.same(events.length, 1, 'after unsubscribing, no additional events happen');

    // subscribe again
    unsub = (proxy as any).___subscribe((evt: WriteEvent) => {
        events.push(evt);
    });

    // write a doc
    // this will trigger the subscription again
    proxy.set(keypair, {
        format: 'es.4',
        path: '/apple.txt',
        content: 'APPLE',
    });

    t.same(events.length, 2, 'subscribed and wrote again; now there are 2 events');

    (proxy as any).___clearWatches();

    t.same(___watchedPaths.size, 0, 'after clearing watches, there are none');

    // write a doc
    // nothing will trigger it anymore
    proxy.set(keypair, {
        format: 'es.4',
        path: '/apple.txt',
        content: 'APPLE',
    });

    t.same(events.length, 2, 'after clearWatches, no more events are triggered');

    proxy.close();
    t.done();
});


t.test('earthstar auto proxy: queries', (t: any) => {
    // set up earthstar
    let workspace = '+gardening.abc';
    let keypair = generateAuthorKeypair('test');
    if (isErr(keypair)) { return; }
    let storage = new StorageMemory([ValidatorEs4], workspace);

    let proxy = makeStorageProxy(storage);

    let ___watchedPaths: Set<string> = (proxy as any).___watchedPaths;
    let ___watchedDocQueries: Set<Query> = (proxy as any).___watchedDocQueries;

    // we'll collect all the write events here
    let events: WriteEvent[] = [];

    // subscribe
    let unsub = (proxy as any).___subscribe((evt: WriteEvent) => {
        events.push(evt);
    });

    // read some stuff
    // this will auto-subscribe us to these docs
    proxy.documents({ pathStartsWith: '/app' });

    t.same(___watchedDocQueries.size, 1, 'we are now watching one query');

    // write a doc
    // this will trigger the subscription
    proxy.set(keypair, {
        format: 'es.4',
        path: '/apple.txt',
        content: 'APPLE',
    });

    // This will also trigger the subscription
    //  even though it doesn't match the query,
    //  because we're not smart enough yet to know
    //  which document writes might fit into which queries.
    // See comments in earthstarAutoProxy.ts .
    // Eventually this should not trigger the subscription
    //  once we fix some things.
    proxy.set(keypair, {
        format: 'es.4',
        path: '/potato.txt',
        content: 'POTATO',
    });

    t.same(events.length, 2, 'two docs written; two events should have occurred (until we get smarter)');

    proxy.close();
    t.done();
});
