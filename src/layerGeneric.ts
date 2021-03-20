import {
    Query,
    Document,
    DocToSet,
    IStorageAsync,
    WriteEvent,
    Emitter,
    AuthorKeypair,
    isErr,
    StorageMemory,
    ValidatorEs4,
    StorageToAsync,
    generateAuthorKeypair,
} from 'earthstar';
import {
    Collection
} from './collection'
import { sleep } from './utils';

import chalk = require('chalk');

//================================================================================

let log = console.log;
let logTest =  (...args: any[]) => console.log(chalk.red(       'TEST     '), ...args);
let logApp  =  (...args: any[]) => console.log(chalk.greenBright('  APP      '), ...args);
let logLayer = (...args: any[]) => console.log(chalk.blueBright( '    LAYER    '), ...args);
let logParts = (...args: any[]) => console.log(chalk.magenta(    '      PARTS    '), ...args);

//================================================================================
// basic ingredients for making layers

// Id is like "todo:123" or "post:abc" or 'post:*' or '*'
type Id = string;

// Layers that have indexes will have two collections:
// completed/ready domain objects, and
// incomplete domain objects where we don't have all the docs for them yet.
// TODO: how can we have more specific collections like Todos, Posts, etc?
interface Index<T> {
    ready: Collection<T>;
    unfinished: Collection<Partial<T>>;
}

// D is domain object such as a Todo
// These are the basic pieces you have to provide to make a layer
abstract class LayerParts<D> {

    // if id is '*', query for all possible docs we care about
    abstract queryForDocs(id: Id): Query;

    // filter the query results to only the ones we want
    abstract docIsRelevant(id: Id, doc: Document): boolean;

    // merge any relevant docs into the index
    // which will emit events from index.ready.on('added' | 'added' | 'deleted')
    abstract updateIndex(doc: Document, index: Index<D>): void;

    // return a set of docs we should save to the storage
    // TODO: this needs to be more specific, like only editing certain properties of a domain object...
    // maybe it needs to be an API of methods?
    abstract docsForSetState(id: Id, domainObject: Partial<D>): DocToSet[];
}

//================================================================================
// Given the basic pieces above, we can assemble them into these more complicated
// kinds of Layers:

class IndexedLayer<D> {
    onChange: Emitter<any>;
    index: Index<D>;
    unsubFromStorage: (() => void) | null = null;
    constructor(public layerParts: LayerParts<D>, public storage: IStorageAsync) {
        logLayer('constructor, subscribing to storage onWrite events');
        this.index = {
            ready: new Collection<D>(),
            unfinished: new Collection<D>(),
        }
        this.onChange = new Emitter<any>();
        this.unsubFromStorage = storage.onWrite.subscribe((evt: WriteEvent) => {
            this._handleOnWrite(evt);
        });
        storage.onWillClose.subscribe(() => {
            this.close();
        });
    }
    close() {
        logLayer('layer.close()');
        if (this.unsubFromStorage !== null) { this.unsubFromStorage(); } 
    }
    _handleOnWrite(writeEvent: WriteEvent) {
        logLayer('handling onWrite from storage:', writeEvent);
        // The Storage has gotten a write, either because we just set() it
        // or something arrived in a synchronization.

        // we get one doc write event at a time.
        // if it's not a latest doc, ignore it.
        if (!writeEvent.isLatest) {
            logLayer("...it's not latest; ignoring");
            return;
        }
        // filter it for interestingness
        if (!this.layerParts.docIsRelevant('*', writeEvent.document)) {
            logLayer("...it's not relevant; ignoring");
            return;
        }
        // if it's interesting, send an onChange event up out of the layer.
        // this might be a false alarm since the whole domain object might
        // not have been assembled yet.
        logLayer("...it IS relevant; sending onChange to app");
        this.onChange.send(true);
    }
    async get(id: Id): Promise<D | undefined> {
        logLayer(`get(${JSON.stringify(id)})`);
        // try to just return something from the index
        let existing = this.index.ready.get(id);
        if (existing !== undefined) {
            logLayer('...found it in the index right away');
            return existing;
        }
        logLayer("...it's not in the index.  querying the Storage...");

        let query = this.layerParts.queryForDocs(id);
        logLayer("...query:", query);
        let docs = await this.storage.documents(query);
        logLayer(`...got ${docs.length} docs`);
        docs = docs.filter(doc => this.layerParts.docIsRelevant(id, doc));
        logLayer(`...${docs.length} of them were relevant; giving up`);
        if (docs.length === 0) { return undefined; }
        logLayer('...updating index');
        for (let doc of docs) {
            this.layerParts.updateIndex(doc, this.index);
        }

        // we've just updated the index, so
        // try again to return something from the index
        existing = this.index.ready.get(id);
        if (existing !== undefined) {
            logLayer('...found it in the index after querying the Storage.');
            return existing;
        }
        logLayer('...still not found in the index, returning undefined.');
        return undefined;
    }
    async setState(keypair: AuthorKeypair, id: Id, domainObject: Partial<D>): Promise<void> {
        // convert the domainObject into a series of docs to write
        logLayer(`setState(${JSON.stringify(id)}, ${JSON.stringify(domainObject)})`);
        let docsToSet = this.layerParts.docsForSetState(id, domainObject);
        logLayer(`...${docsToSet.length} docs to set`);
        // write them
        for (let docToSet of docsToSet) {
            let err = this.storage.set(keypair, docToSet);
            if (isErr(err)) {
                console.error(err);
            }
        }
        logLayer(`...layer.setState is done`);
    }
}

//================================================================================
// EXAMPLE

interface Todo {
    id: string,
    text: string,
    done: boolean,
}
class TodoLayerParts extends LayerParts<Todo> {
    // paths: /todos/v1/${ID}/text.txt
    //        /todos/v1/${ID}/done.json

    // helpers
    _makePath(id: Id, filename: string): string {
        return `/todos/v1/${id}/${filename}`;
    }
    _parsePath(path: string): { id: Id, filename: string } | string {
        // return parsed path or err string
        let parts = path.split('/');
        if (parts.length !== 5) { return 'wrong number of slashes'; }
        if (parts[1] !== 'todos') { return 'path is not in /todos/'; }
        if (parts[2] !== 'v1') { return 'expected /v1/'; }
        let id = parts[3];
        let filename = parts[4];
        return { id, filename };
    }
    _todoIsComplete(todo: Partial<Todo>): boolean {
        return (todo.done !== undefined && todo.text !== undefined && todo.text !== '');
    }

    //-----------------------------------

    // if id is '*', query for all possible docs we care about
    queryForDocs(id: Id): Query {
        if (id === '*') {
            return { pathStartsWith: '/todos/v1/' };
        } else {
            return { pathStartsWith: `/todos/v1/${id}/` };
        }
    }

    // filter the query results to only the ones we want
    docIsRelevant(idWanted: Id, doc: Document): boolean {
        // keep when content === '' -- we need to know about about deletions
        let parsed = this._parsePath(doc.path);
        if (typeof parsed === 'string') { return false; }
        let { id: idFound, filename } = parsed;
        if (idWanted !== '*' && idWanted !== idFound) { return false; }
        if (filename !== 'text.txt' && filename !== 'done.json') { return false; }
        return true;
    }

    // merge any relevant docs into the index
    // which will emit events from index.ready.on('added' | 'added' | 'deleted')
    updateIndex(doc: Document, index: Index<Todo>): void {
        // parse path
        let parsed = this._parsePath(doc.path);
        if (typeof parsed === 'string') { return; }
        let { id, filename } = parsed;

        // obtain existing or new Todo
        let todo: Partial<Todo> =
            index.ready.get(id)
            || index.unfinished.get(id)
            || { id: id };

        // add, update, or remove Todo properties
        if (filename === 'text.txt') {
            if (doc.content === '') {
                delete todo.text;
            } else {
                todo.text = doc.content;
            }
        } else if (filename === 'done.json') {
            if (doc.content === '') {
                delete todo.done;
            } else {
                todo.done = doc.content === 'true';
            }
        }

        // move or add into appropriate index
        if (this._todoIsComplete(todo)) {
            index.unfinished.delete(id);
            index.ready.set(id, todo as Todo);
        } else {
            index.ready.delete(id);
            index.unfinished.set(id, todo);
        }
    }

    // return a set of docs we should save to the storage
    docsForSetState(id: Id, todo: Partial<Todo>): DocToSet[] {
        let docs: DocToSet[] = [];
        if (todo.text !== undefined) {
            docs.push({
                format: 'es.4',
                path: `/todo/v1/${id}/text.txt`,
                content: todo.text,
            });
        }
        if (todo.done !== undefined) {
            docs.push({
                format: 'es.4',
                path: `/todo/v1/${id}/done.json`,
                content: todo.done === true ? 'true' : 'false',
            });
        }
        return docs;
    }
}

//================================================================================
// Test


let main = async () => {

    let workspace = '+gardening.jaofiajfoaf';
    let keypair = generateAuthorKeypair('suzy') as AuthorKeypair;
    let storage = new StorageToAsync(new StorageMemory([ValidatorEs4], workspace));

    let layer = new IndexedLayer(new TodoLayerParts(), storage);

    log('');
    logApp('subscribing to layer events (index and onChange)');
    layer.onChange.subscribe(() => {
        logApp('got onChange event from layer');
    });
    layer.index.ready.on('*', (channel: string, data: any) => {
        logApp('got event from layer collection:', channel, data);
    });

    log('');
    logApp('layer.get("abc")...');
    logApp('... = ', await layer.get('abc'));
    await sleep(100);

    log('');
    logApp('setting todo "abc"');
    await layer.setState(keypair, 'abc', { text: 'apples', done: false });
    logApp('    ...done');
    await sleep(100);

    log('');
    logApp('layer.get("abc")...');
    logApp('... = ', await layer.get('abc'));
    await sleep(100);

    log('');
    logTest('closing storage and quitting');
    await storage.close();
}
main();
