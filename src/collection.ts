import Nanobus from 'nanobus';
import { deepEqual } from './utils';

type Thunk = () => void;

export class Collection<T> {
    bus: any;
    _items: Record<string, T> = {};
    constructor(initialItems?: Record<string, T>) {
        this.bus = new Nanobus();
        // Initial items will not generate any events
        if (initialItems) { this._items = initialItems; }
    }

    //----------------------------------------
    // SUBSCRIPTIONS
    on(channel: string, cb: (...args: any) => void): Thunk {
        this.bus.on(channel, cb);
        return () => this.bus.removeListener(channel, cb);
    }

    //----------------------------------------

    // WRITE

    // set: add or update
    set(id: string, item: T) {
        if (id in this._items) {
            let prev = this._items[id];
            this._items[id] = item;
            if (!deepEqual(prev, item)) {
                this.bus.emit('changed', { prev: prev, new: item });
            }
        } else {
            this._items[id] = item;
            this.bus.emit('added', item);
        }
    }
    delete(id: string): boolean {
        // return true if deleted; false if not found
        let item = this._items[id];
        if (item) {
            delete this._items[id];
            this.bus.emit('deleted', item);
            return true;
        } else {
            return false;
        }
    }

    //----------------------------------------
    // READ

    get(id: string): T | undefined {
        return this._items[id];
    }
    has(id: string): boolean {
        return (id in this._items);
    }
    ids(): string[] {
        let ids = Object.keys(this._items);
        ids.sort();
        return ids;
    }
    items(): T[] {
        let entries = Object.entries(this._items);
        entries.sort();
        return entries.map(([id, item]) => item);
    }
    entries(): [id: string, item: T][] {
        let entries = Object.entries(this._items);
        entries.sort();
        return entries;
    }
    count(): number {
        return Object.keys(this._items).length;
    }
}
