import Nanobus from 'nanobus';

let log = console.log;

interface Task {
    id: string,
    text: string,
    done: boolean,
}

export class LayerEventBus {
    bus: any;
    tasks: Record<string, Task> = {};
    constructor() {
        this.bus = new Nanobus();
    }
    list() {
        return Object.values(this.tasks);
    }
    add(task: Task) {
        this.tasks[task.id] = task;
        this.bus.emit('task:new', task);
    }
    toggle(id: string) {
        this.tasks[id].done = !this.tasks[id].done;
        this.bus.emit('task:modified', this.tasks[id]);
    }
    delete(id: string) {
        let task = this.tasks[id];
        delete this.tasks[id];
        this.bus.emit('task:deleted', task);
    }
}

let layer = new LayerEventBus();

layer.bus.on('task:new', (task: Task) => {
    log('    got event task:new', task);
});
layer.bus.on('task:modified', (task: Task) => {
    log('    got event task:modified', task);
});
layer.bus.on('task:deleted', (task: Task) => {
    log('    got event task:deleted', task);
});
layer.bus.on('*', () => { log('    got * event'); });

log('adding 2 tasks');
layer.add({ id: 'abc', text: 'get apples', done: false });
layer.add({ id: 'xyz', text: 'get bananas', done: false });

log('list of tasks', JSON.stringify(layer.list(), null, 4));

log('toggling a task');
layer.toggle('abc');

log('deleting a task');
layer.delete('abc');


