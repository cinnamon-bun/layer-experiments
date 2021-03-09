import {
    AuthorKeypair,
    generateAuthorKeypair,
    isErr,
    IStorage,
    Query,
    StorageMemory,
    ValidatorEs4,
    WriteEvent
} from 'earthstar';
import { log } from './utils';

import { makeStorageProxy } from './earthstarAutoProxy';

interface Task {
    id: string,
    text: string,  // primary doc
    done: boolean,
}

interface TaskEvent {
    kind: 'CHANGE' | 'DELETE',
    id: string,
}

export class LayerEarthstarAutoProxy {
    proxy: IStorage;
    constructor(storage: IStorage) {
        // Make an auto-watching proxy for our storage.
        // We don't have to manually track which docs we've accessed
        // so we know which things to notify our subscribers about;
        // this does it for us.
        // We can just use it like a regular Storage object.
        this.proxy = makeStorageProxy(storage);
    }
    // subscribe
    onChange(cb: (taskEvent: TaskEvent) => void) {

        // We get WriteEvents from the Earthstar storage for individual
        // docs.  Somehow we have to translate those into TaskEvents
        // for entire tasks, which are made of multiple docs, without
        // emitting multiple events for the same Task.
        // Our solution for now is to treat one of a task's documents
        // as the "primary doc" and sometimes ignore the other docs.

        let unsub = (this.proxy as any).___subscribe((evt: WriteEvent) => {
            let id = evt.document.path.split('/')[2];
            if (evt.document.content === '') {
                // only pay attention when the primary doc is deleted
                if (evt.document.path.endsWith('/text.txt')) {
                    cb({ kind: 'DELETE', id });
                }
            } else {
                // but pay attention when any doc is edited
                cb({ kind: 'CHANGE', id });
            }
        });
        return unsub;
    }
    clearWatches() {
        // wipe the memory of which docs we've accessed and are watching
        (this.proxy as any).___clearWatches();
    }
    // read
    list(): Task[] {
        // paths like /task/ID/text.txt
        //            /task/ID/done.json
        let tasks: Record<string, Task> = {};
        let docs = this.proxy.documents({
            pathStartsWith: '/task/',
        });
        for (let doc of docs) {
            let id = doc.path.split('/')[2];
            let task: Record<string, any> = tasks[id] || { id };
            if (doc.path.endsWith('/text.txt')) {
                task.text = doc.content;
            }
            if (doc.path.endsWith('/done.json')) {
                // this doc can be missing; it defaults to false if so
                task.done = doc.content === 'true';
            }
            tasks[id] = task as Task;
        }
        // incomplete tasks missing their primary doc
        // are deleted here as if they don't exist at all,
        // in case there was an incomplete sync.
        for (let [id, task] of Object.entries(tasks)) {
            if (task.text === undefined || task.text === '') {
                delete tasks[id];
            }
        }
        return Object.values(tasks);
    }
    get(id: string): Task | undefined {
        let textContent = this.proxy.getContent('/task/' + id + '/text.txt');
        let doneContent = this.proxy.getContent('/task/' + id + '/done.json');
        // if primary doc is missing, the whole Task is missing.
        if (textContent === undefined) { return undefined; }
        // if the other doc is missing, it defaults to false
        let done = doneContent === undefined
                    ? false
                    : doneContent === 'true'
        return {
            id,
            text: textContent,
            done,
        }
    }
    // write
    add(keypair: AuthorKeypair, task: Task) {
        this.proxy.set(keypair, {
            format: 'es.4',
            path: '/task/' + task.id + '/text.txt',
            content: task.text,
        });
        this.proxy.set(keypair, {
            format: 'es.4',
            path: '/task/' + task.id + '/done.json',
            content: JSON.stringify(task.done),
        });
    }
    toggle(keypair: AuthorKeypair, id: string) {
        let task = this.get(id);
        if (task === undefined) { return; }
        task.done = !task.done;
        this.proxy.set(keypair, {
            format: 'es.4',
            path: '/task/' + task.id + '/done.json',
            content: JSON.stringify(task.done),
        });
    }
    setDone(keypair: AuthorKeypair, id: string, done: boolean) {
        this.proxy.set(keypair, {
            format: 'es.4',
            path: '/task/' + id + '/done.json',
            content: JSON.stringify(done),
        });
    }
    delete(keypair: AuthorKeypair, id: string) {
        this.proxy.set(keypair, {
            format: 'es.4',
            path: '/task/' + id + '/text.txt',
            content: '',
        });
        this.proxy.set(keypair, {
            format: 'es.4',
            path: '/task/' + id + '/done.json',
            content: '',
        });
    }
}

let test = () => {
    // set up earthstar
    let workspace = '+gardening.aaa';
    let keypair = generateAuthorKeypair('test');
    if (isErr(keypair)) { return; }
    let storage = new StorageMemory([ValidatorEs4], workspace);

    let layer = new LayerEarthstarAutoProxy(storage);

    // subscribe
    layer.onChange((taskEvent: TaskEvent) => {
        log('    🔶🔶 taskEvent', taskEvent);
    });

    // do actions
    log('adding 2 tasks, "aaa" and "bbb"');
    layer.add(keypair, { id: 'aaa', text: 'get apples', done: false });
    layer.add(keypair, { id: 'bbb', text: 'get bananas', done: false });

    log('list of tasks:', layer.list());
    log('since we read every task, we are now subscribed to events from every task.')

    log('')

    log('toggling task "aaa"');
    layer.toggle(keypair, 'aaa');

    log('deleting task "aaa"');
    layer.delete(keypair, 'aaa');

    log('')

    log('clearing watches; we are no longer subscribed to anything.');
    layer.clearWatches();

    log('deleting "bbb" (should not trigger an event)');
    layer.delete(keypair, 'bbb');

    log('')

    log('adding 2 new tasks, "fff" and "ggg"');
    layer.add(keypair, { id: 'fff', text: 'get fish', done: false });
    layer.add(keypair, { id: 'ggg', text: 'get grapes', done: false });

    log('get("fff") =', layer.get('fff'));
    log('now we\'ve subscribed to "fff" just by getting it.');

    log('');

    log('editing "fff" should send an event');
    layer.setDone(keypair, 'fff', true);
    log('editing "ggg" should not, since we haven\'t read it.');
    layer.setDone(keypair, 'ggg', true);

    log('');

    storage.close();
};
test();

