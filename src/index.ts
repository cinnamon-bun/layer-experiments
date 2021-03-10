export {}

/*

// EVENT BUS
class Todos {
    bus = new Bus();
    complete(id) {
        this.todos[id].done = true;
        this.bus.send('todoCompleted', {
            id: id,
            todo: this.todos[id],
        });
    }
}
todos.bus.on('todoCompleted', () => {});
todos.complete(id);

// STATE-BASED
// immer
class Todos {
    state: TodoState
    onStateChange(cb) {}
    complete(id) {
        // mutate the state
        this.state.todos[id].done = true;
        this._bump();

        // or with immer
        let newState = produce(this.state, (draft) => {
            draft.todos[id].done = true;
        });
        this.setState(newState);

        // or
        this.setState({
            todos: {
                ...this.todos,
                [id]: {
                    ...this.todos[id],
                    done: true;
                }
            }
        });
    }
}
todos.onStateChange((oldState, newState) => {});
todos.complete('abcdefg');

// ATOMS OR INDIVIDUAL OBSERVABLES
class Todos {
    atoms = {
        id1: new Atom({ done: false, text: 'hello' }),
        id2: new Atom({ done: false, text: 'hello' }),
    }
    complete(id) {
        let atom = this.atoms[id];
        atom.set({ ...atom.value(), done: true });
    }
}
todos.atoms['id1'].onChange(...);  // but how to get all of them...
todos.complete('abcdefg')

// PROXY, AUTO-WATCH
// valtio

class Todos {
    state = proxy({
        id1: { done: false, text: 'hello' },
        id2: { done: false, text: 'hello' },
    });
    complete(id) {
        this.state[id].done = true;
    }
}
subscribe(state, () => {  // the state changed somewhere });
subscribe(state.id1, () => { // only item 1 changed });
todos.complete('abcdefg');


redux w/ actions & selectors

observable tree: baobab, mimosa
reactive: cyclosis

request-response with promises: each item you want, returns a promise that might resolve immediately
or streams / subscriptions: subscribe to any item and get a callback whenever it changes


*/
