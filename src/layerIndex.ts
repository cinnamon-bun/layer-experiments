import { log } from './utils';
import { Collection } from './collection';
import { Document, AuthorKeypair, IStorage, WriteEvent, generateAuthorKeypair, StorageMemory, ValidatorEs4, isErr } from 'earthstar';

//================================================================================
// PATHS

let APP_NAME = 'tasks-v1';

let makeTextPath = (id: string) =>
    `/${APP_NAME}/${id}/text.txt`;
let makeDonePath = (id: string) =>
    `/${APP_NAME}/${id}/done.json`;

let parsePath = (path: string) => {
    let [_0, appname, id, filename] = path.split('/');
    return { appname, id, filename };
};

//================================================================================
// TASK TYPE

interface Task {
    id: string,
    text: string,
    done: boolean,
}
interface PartialTask {
    id: string,
    text?: string,
    done?: boolean,
}

// it does the task have all its properties
// and it's not deleted?
let taskIsComplete = (task: Task | PartialTask): boolean =>
    task.text !== undefined
    && task.done !== undefined
    && task.text !== '';

//================================================================================

/*
 * A style of making Layers which pre-loads everything into a
 *  cache in memory, which we call an index.
 * 
 * As docs are changed in Earthstar, the index is updated.
 * 
 * There's only one code path for updating the index, and it
 *  operates on one document at a time.  It's used for the
 *  initial batch load of the index, and also for later
 *  updates to Earthstar documents.  It's called _ingestOneDoc.
 * 
 * In this case we're using a Collection as the API for apps to
 *  read and subscribe to changes in the index.  It seems silly
 *  to duplicate all the read and subscribe functionality into
 *  methods of this Layer.
 * 
 * However for writes to the Tasks, we provide our own API methods
 *  on the Layer.  These writes...
 *    1. Go directly down to Earthstar document writes
 *    2. Are then picked up by the indexing method which
 *        updates the Collection
 *    3. Then trickle back into the app through the
 *        Collection's events
 */
export class LayerIndex {
    storage: IStorage;

    // Each task is stored in 2 earthstar documents:
    //      /tasks-v1/TASKID/text.txt   --> a string
    //      /tasks-v1/TASKID/done.json  --> "true" or "false"
    // Both must exist and be non-empty strings for the
    //  task to be considered "complete".
    // Incomplete tasks are hidden from the app as if they
    //  don't exist.

    // Each task can our index lives in one of these two collections.
    // Users of this layer are expected to subscribe to events from
    //  the "tasks" collection, and to read tasks from that collection,
    //  but should use the write methods of this Layer (set, delete, etc)
    // Users should also pay attention to storage.isClosed() and not
    //  try to write if the storage is closed.
    tasks: Collection<Task>;
    // Incomplete tasks are ones with missing documents or deleted content ('')
    // Users should ignore this collection.  Tasks wait around here until
    //  they reach completeness.
    _tasksIncomplete: Collection<PartialTask>;

    constructor(storage: IStorage) {
        this.storage = storage;
        this.tasks = new Collection<Task>();
        this._tasksIncomplete = new Collection<PartialTask>();

        log('        🔷 Layer.constructor: subscribing to storage writes');
        let unsubFromWrites = storage.onWrite.subscribe((evt: WriteEvent) => {
            if (evt.isLatest) {
                this._ingestOneDoc(evt.document);
            }
        });

        storage.onWillClose.subscribe(() => {
            // TODO: should the Layer also have a closed state
            // that it enters when the underlying storage is closed?
            log('        🔷 Layer: storage is closing; unsubscribing from it');
            unsubFromWrites();
        });

        this._load();
    }

    // Do initial batch indexing on startup.
    // Apps probably should subscribe to our tasks collection
    //  after this batch load is done, not before.
    _load() {
        let docs = this.storage.documents({
            history: 'latest',
            pathStartsWith: `/${APP_NAME}/`,
        });
        log(`        🔷 Layer._load(): loading ${docs.length} docs from the IStorage at startup`);
        for (let doc of docs) {
            this._ingestOneDoc(doc);
        }
    }

    //----------------------------------------
    // WRITE
    // The write methods don't use the index, they write directly
    // to Earthstar.  From there, the Earthstar WriteEvents will
    // come back up into _ingestDoc and update the index.

    // set: can add new tasks or edit existing tasks
    set(keypair: AuthorKeypair, task: Task) {
        log(`        🔷 Layer.set("${task.id}")`);
        this.storage.set(keypair, {
            format: 'es.4',
            path: makeDonePath(task.id),
            content: JSON.stringify(task.done),
        });
        // At this moment between these two writes,
        // the app can observe the Task in a mixed state.
        // That's just the way things go with Earthstar.
        // The same could happen if two users wrote at the same time.
        // Apps may want to debounce their subscriptions to avoid this.
        this.storage.set(keypair, {
            format: 'es.4',
            path: makeTextPath(task.id),
            content: task.text,
        });
    }
    // toggle an existing task
    // read from the index, but write to Earthstar
    toggle(keypair: AuthorKeypair, id: string) {
        log(`        🔷 Layer.toggle("${id}")`);
        let task = this.tasks.get(id);
        if (task === undefined) { return; }
        this.storage.set(keypair, {
            format: 'es.4',
            path: makeDonePath(task.id),
            content: JSON.stringify(!task.done),
        });
    }
    // delete an existing task
    delete(keypair: AuthorKeypair, id: string) {
        log(`        🔷 Layer.delete("${id}")`);
        this.storage.set(keypair, {
            format: 'es.4',
            path: makeTextPath(id),
            content: '',
        });
        this.storage.set(keypair, {
            format: 'es.4',
            path: makeDonePath(id),
            content: '',
        });
    }

    //--------------------------------------------------
    // INDEX

    _ingestOneDoc(doc: Document) {
        // Accept a document from the storage into our index,
        //  and build up the index datastructures.
        // Our entire index is built this way, one Earthstar
        //  document at a time.

        // Documents will arrive in random order
        //  and with random timing,
        //  except we can trust that an outdated doc will
        //  never arrive after a more recent one for the same path.

        // When hooked up to IStorage events,
        //  this must only be called when isLatest === true.
        // Otherwise we might ingest outdated documents.

        // There's a small chance that the batch _load() could give
        //  us outdated documents if newer ones arrive at the same time
        //  from syncing or local writes.  This can only happen if
        //  everything is async, allowing it to happen a bit out of order.
        // To fix this we would need to track the timestamps
        //  of each document's data in the Tasks, like this:
        //       {
        //         id: 'aaa',
        //         text: 'apples',
        //         textTimestamp: 157203872,
        //         done: false,
        //         doneTimestamp: 152072393,
        //       }
        // ...and check the timestamps against incoming documents
        //  as we ingest them.
        // We might also want to strip out those timestamps when handing
        //  data up to the App.


        let { appname, id, filename } = parsePath(doc.path);
        log(`        🔷 Layer._ingestOneDoc: ${doc.path}`);

        if (appname !== APP_NAME) { return; }

        let existing: Task | PartialTask | undefined = this.tasks.get(id) || this._tasksIncomplete.get(id);

        let newTask: PartialTask;
        if (existing === undefined) {
            newTask = { id };
        } else {
            newTask = { ...existing };
        }

        if (filename === 'text.txt') {
            newTask.text = doc.content;
        } else if (filename === 'done.json') {
            if (doc.content === '') {
                delete newTask.done;
            } else {
                newTask.done = (doc.content === 'true');
            }
        }

        if (taskIsComplete(newTask)) {
            // Set tasks last, so that everything is settled
            //  by the time the tasks collection runs its subscription callbacks.
            // Users are not supposed to subscribe to tasksIncomplete.
            log('        🔷                    ... :) task is complete!');
            this._tasksIncomplete.delete(id);
            this.tasks.set(id, newTask as Task);
        } else {
            // Set tasks last
            log('        🔷                    ... XX task is NOT complete');
            this._tasksIncomplete.set(id, newTask);
            this.tasks.delete(id);
        }
    }
}

let test = () => {
    // set up earthstar
    let workspace = '+gardening.aaa';
    let keypair = generateAuthorKeypair('test');
    if (isErr(keypair)) { return; }
    let storage = new StorageMemory([ValidatorEs4], workspace);

    log('💛 creating Layer');
    let layer = new LayerIndex(storage);

    // subscribe
    let unsub1 = layer.tasks.on('added', (task: Task) => {
        log('    🔶🔶 task was added', task);
    });
    let unsub2 = layer.tasks.on('changed', (data: { prev: Task, new: Task }) => {
        log('    🔶🔶 task was changed');
        log('                from:', data.prev);
        log('                  to:', data.new);
    });
    let unsub3 = layer.tasks.on('deleted', (task: Task) => {
        log('    🔶🔶 task was deleted', task);
    });
    //layer.tasks.on('*', () => { log('    🔶 got * event'); });

    // do actions
    log('');
    log('💛 adding 2 tasks');
    layer.set(keypair, { id: 'aaa', text: 'apples', done: false });
    layer.set(keypair, { id: 'bbb', text: 'bananas', done: false });

    log('💛 list of ids', layer.tasks.ids());
    log('💛 list of tasks', layer.tasks.items());

    log('');
    log('💛 toggling a task');
    layer.toggle(keypair, 'aaa');

    log('💛 modifying a task');
    layer.set(keypair, { id: 'bbb', text: 'bananas!!!', done: false });

    log('💛 deleting a task');
    layer.delete(keypair, 'aaa');

    log('');
    log('💛 disconnecting from original layer');
    // Note this just removes our listeners here in test(), we should
    // also add a layer.close() method that disconnects it from storage events
    // so it can stop updating its index.
    unsub1();
    unsub2();
    unsub3();

    log('');
    log('💛 making new layer to test batch loading of existing data');
    let layer2 = new LayerIndex(storage);

    log('');
    log('💛 list of ids', layer2.tasks.ids());
    log('💛 list of tasks', layer.tasks.items());

    log('');
    log('💛 closing storage and shutting down');
    storage.close();
};
test();