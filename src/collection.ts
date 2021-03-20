import Nanobus from 'nanobus';
import { deepEqual } from './utils';

type Thunk = () => void;

type EventName = 'changed' | 'added' | 'deleted' | '*';

/*
 * This class is useful for holding a set of items,
 * each with a unique id,
 * and subscribing to changes in the items.
 * 
 * The change events and their callback signatures are:
 *    'changed'         callback('changed', { prev, new })
 *    'added'           callback('added', item)
 *    'deleted'         callback('deleted', item)
 * 
 *    'changed:${id}'   callback('changed:${id}', { prev, new })
 *    'added:${id}'     callback('added:${id}', item)
 *    'deleted:${id}'   callback('deleted:${id}', item)
 * 
 * You can also subscribe to the channel '*' to get all events,
 * though unfortunately you will get two events for each change
 * ("changed" and "changed:ID") so you will need to filter out
 * events that contain ':' in their names to remove duplicates.
 * 
 * The 'changed' event checks for deep equality first and only
 * fires if the object is actually changed, not just a new object
 * holding the same data.
 * 
 * When reading items or ids, they are always sorted by id.
 */

export class Collection<T> {
    _bus: any;
    _items: Record<string, T> = {};
    constructor(initialItems?: Record<string, T>) {
        this._bus = new Nanobus();
        // Initial items will not generate any events
        if (initialItems) { this._items = initialItems; }
    }

    //----------------------------------------
    // SUBSCRIPTIONS

    on(channel: EventName, cb: (...args: any) => void): Thunk {
        // subscribe to a nanobus channel.

        // make the callback unique so we have more normal semantics around unsubscribing,
        // since nanobus unsubscribes using the identity of the callback
        let cb2 = (...args: any) => cb(...args);

        this._bus.on(channel, cb2);

        // return an unsubscribe thunk
        return () => this._bus.removeListener(channel, cb2);
    }

    //----------------------------------------
    // WRITE

    // set: add or update
    set(id: string, item: T) {
        if (id in this._items) {
            let prev = this._items[id];
            this._items[id] = item;
            if (!deepEqual(prev, item)) {
                this._bus.emit('changed', { prev: prev, new: item });
                this._bus.emit(`changed:${id}`, { prev: prev, new: item });
            }
        } else {
            this._items[id] = item;
            this._bus.emit('added', item);
            this._bus.emit(`added:${id}`, item);
        }
    }
    delete(id: string): boolean {
        // return true if deleted; false if not found
        let item = this._items[id];
        if (item) {
            delete this._items[id];
            this._bus.emit('deleted', item);
            this._bus.emit(`deleted:${id}`, item);
            return true;
        } else {
            return false;
        }
    }
    deleteAll(): void {
        for (let id of this.ids()) {
            this.delete(id);
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
