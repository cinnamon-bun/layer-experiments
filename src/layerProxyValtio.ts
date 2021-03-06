import { proxy, subscribe, snapshot } from 'valtio';
import { subscribeKey } from 'valtio/utils';
import { log } from './utils';

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
    list() {
        let snap = snapshot(this.state);
        return Object.values(snap.tasks);
    }
    get(id: string) {
        let snap = snapshot(this.state);
        return snap.tasks[id];
    }
    // write
    add(task: Task) {
        this.state.tasks[task.id] = task;
    }
    toggle(id: string) {
        let snap = snapshot(this.state);
        this.state.tasks[id].done = !snap.tasks[id].done;
    }
    delete(id: string) {
        delete this.state.tasks[id];
    }
}

let test = () => {
    let layer = new LayerProxyValtio();

    // subscribe to all tasks
    subscribe(layer.state, () => {
        // BUG in Valtio:
        // can't JSON.stringify the state or snapshot(state) --
        // how to get a plain un-proxied object back?
        log('    🔶 state was changed to:', layer.state);
    }, true);  // set this false to coalesce consecutive events in the same tick

    // subscribe to a specific task
    subscribeKey(layer.state.tasks, 'abc', () => {
        log('    🔶🔶 todo "abc" changed to', layer.state.tasks['abc']);
    }, true);

    // do actions
    log('adding 2 tasks');
    layer.add({ id: 'abc', text: 'get apples', done: false });
    layer.add({ id: 'xyz', text: 'get bananas', done: false });

    log('list of tasks', JSON.stringify(layer.list(), null, 4));

    log('toggling a task');
    layer.toggle('abc');

    log('deleting a task');
    layer.delete('abc');
};
test();

