import { proxy, subscribe, snapshot } from 'valtio';
import { subscribeKey } from 'valtio/utils';
import { log, sleep } from './utils';

interface Task {
    id: string,
    text: string,
    done: boolean,
}

interface State {
    tasks: Record<string, Task>,
}

/*
 * Valtio creates a proxy wrapper around the state object.
 * It intercepts changes to the state and lets us subscribe
 *  to those changes.
 * 
 * In the synchronous version, it collapses repeated consecutive
 *  changes into a single event, but that's configurable.
 * In the async version each change is a separate event.
 */
export class LayerProxyValtio {
    state: State;
    constructor() {
        let initialState: State = { tasks: {} };
        this.state = proxy(initialState);
    }
    // read
    async list() {
        await sleep(400);
        let snap = snapshot(this.state);
        return Object.values(snap.tasks);
    }
    async get(id: string) {
        await sleep(400);
        let snap = snapshot(this.state);
        return snap.tasks[id];
    }
    // write
    async add(task: Task) {
        await sleep(400);
        this.state.tasks[task.id] = task;
    }
    async toggle(id: string) {
        await sleep(400);
        let snap = snapshot(this.state);
        this.state.tasks[id].done = !snap.tasks[id].done;
    }
    async delete(id: string) {
        await sleep(400);
        delete this.state.tasks[id];
    }
}

let test = async () => {
    let layer = new LayerProxyValtio();

    // subscribe to all tasks
    subscribe(layer.state, () => {
        log('    🔶 state was changed to:', JSON.stringify(layer.state, null, 4));
    }, true);  // set this false to coalesce consecutive events in the same tick

    // subscribe to a specific task
    subscribeKey(layer.state.tasks, 'abc', () => {
        log('    🔶🔶 todo "abc" changed to', layer.state.tasks['abc']);
    }, true);

    // do actions
    log('adding 2 tasks');
    await layer.add({ id: 'abc', text: 'get apples', done: false });
    await layer.add({ id: 'xyz', text: 'get bananas', done: false });

    log('list of tasks', JSON.stringify(await layer.list(), null, 4));

    log('toggling a task');
    await layer.toggle('abc');

    log('deleting a task');
    await layer.delete('abc');
};
test();

