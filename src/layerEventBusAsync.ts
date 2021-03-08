import Nanobus from 'nanobus';
import { log, sleep } from './util';

interface Task {
    id: string,
    text: string,
    done: boolean,
}

export class LayerEventBusAsync {
    bus: any;
    tasks: Record<string, Task> = {};
    constructor() {
        this.bus = new Nanobus();
    }
    async list() {
        await sleep(400);
        return Object.values(this.tasks);
    }
    async add(task: Task) {
        await sleep(400);
        this.tasks[task.id] = task;
        this.bus.emit('task:new', task);
    }
    async get(id: string) {
        await sleep(400);
        return this.tasks[id];
    }
    async toggle(id: string) {
        await sleep(400);
        this.tasks[id].done = !this.tasks[id].done;
        this.bus.emit('task:modified', this.tasks[id]);
    }
    async delete(id: string) {
        await sleep(400);
        let task = this.tasks[id];
        delete this.tasks[id];
        this.bus.emit('task:deleted', task);
    }
}

let test = async () => {
    let layer = new LayerEventBusAsync();

    // subscribe
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
    await layer.add({ id: 'abc', text: 'get apples', done: false });
    await layer.add({ id: 'xyz', text: 'get bananas', done: false });

    log('list of tasks', JSON.stringify(await layer.list(), null, 4));

    log('toggling a task');
    await layer.toggle('abc');

    log('deleting a task');
    await layer.delete('abc');
};
test();

