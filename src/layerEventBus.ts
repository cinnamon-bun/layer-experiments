import Nanobus from 'nanobus';
import { log, sleep } from './util';

interface Task {
    id: string,
    text: string,
    done: boolean,
}

/*
 * This class emits different kinds of events
 *  when tasks are added, changed, or deleted.
 * You can subscribe to one kind of event,
 *  or use '*' to subscribe to all events.
 * You can't subscribe to events for a specific todo,
 *  although that would be possible if we also emit events
 *  like `task:added:${task.id}`.
 */
export class LayerEventBus {
    bus: any;
    _tasks: Record<string, Task> = {};
    constructor() {
        this.bus = new Nanobus();
    }
    // read
    list() {
        return Object.values(this._tasks);
    }
    get(id: string) {
        return this._tasks[id];
    }
    // write
    add(task: Task) {
        this._tasks[task.id] = task;
        this.bus.emit('task:added', task);
    }
    toggle(id: string) {
        this._tasks[id].done = !this._tasks[id].done;
        this.bus.emit('task:changed', this._tasks[id]);
    }
    delete(id: string) {
        let task = this._tasks[id];
        delete this._tasks[id];
        this.bus.emit('task:deleted', task);
    }
}

let test = () => {
    let layer = new LayerEventBus();

    // subscribe
    layer.bus.on('task:added', (task: Task) => {
        log('    🔶 got event task:added', task);
    });
    layer.bus.on('task:changed', (task: Task) => {
        log('    🔶 got event task:changed', task);
    });
    layer.bus.on('task:deleted', (task: Task) => {
        log('    🔶 got event task:deleted', task);
    });
    layer.bus.on('*', () => { log('    🔶 got * event'); });

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

