import Nanobus from 'nanobus';
import { deepEqual, deepCopy, log, sleep } from './util';

interface Task {
    id: string,
    text: string,
    done: boolean,
}

interface State {
    tasks: Record<string, Task>;
}

type Cb = (newState: State, oldState: State) => void;

export class LayerWithState {
    state: State = { tasks: {} };
    prevState: State;
    subscribers: Set<Cb> = new Set<Cb>();
    constructor() {
        this.prevState = deepCopy(this.state);
    }
    // subscription management
    onChange(cb: any) {
        this.subscribers.add(cb);
        return () => this.subscribers.delete(cb);
    }
    _notify() {
        if (!deepEqual(this.state, this.prevState)) {
            for (let cb of this.subscribers) {
                cb(this.state, this.prevState);
            }
        }
        this.prevState = deepCopy(this.state);
    }
    // read
    list() {
        return Object.values(this.state.tasks);
    }
    get(id: string) {
        return this.state.tasks[id];
    }
    // write
    add(task: Task) {
        this.state.tasks[task.id] = task;
        this._notify();
    }
    toggle(id: string) {
        this.state.tasks[id].done = !this.state.tasks[id].done;
        this._notify();
    }
    delete(id: string) {
        delete this.state.tasks[id];
        this._notify();
    }
}

let test = () => {
    let layer = new LayerWithState();

    // subscribe
    layer.onChange((newState: State, oldState: State) => {
        log('    🔶 state changed to ', newState);
    });

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

