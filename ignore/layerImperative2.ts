import {
    Query,
    Document,
    DocToSet,
    IStorageAsync,
    WriteEvent,
    Emitter,
    AuthorKeypair,
    isErr,
    StorageMemory,
    ValidatorEs4,
    StorageToAsync,
    generateAuthorKeypair,
} from 'earthstar';
import { match, true } from 'tap';

//================================================================================
// HELPERS

// check if actualPath "/todos/id:aaaaa/foo.txt" matches idealPath "/todos/id:*/foo.txt"
// only allow asterisks in that specific pattern: "/foo/fieldname:*/anotherfield:*/bar"
// any number of asterisks are ok
let pathMatches = (idealPath: string, actualPath: string): boolean => {
    if (idealPath === actualPath) { return true; }

    let actualSegs = actualPath.split('/');
    let idealSegs = idealPath.split('/');
    if (actualSegs.length !== idealSegs.length) { return false; }

    for (let ii = 0; ii < actualSegs.length; ii++) {
        let actualSeg = actualSegs[ii];
        let idealSeg = idealSegs[ii];
        if (actualSeg !== idealSeg) {
            // check for idealSeg like "id:*" and actualSeg like "id:aaaaa"
            if (idealSeg.endsWith(':*')) {
                // TODO: do something smarter in case there are multiple ':'
                let [name] = idealSeg.split(':', 1);
                if (!actualSeg.startsWith(name + ':')) {
                    // ideal seg wanted "id:*" but actualSeg didn't match that
                    return false;
                }
            } else {
                // just a plain old mismatch in segs
                return false;
            }
        }
    }
    return true;
}

//================================================================================

abstract class FieldValidator<T> {
    abstract pathMatches(path: string): boolean;
    abstract contentToValue(content: string): T | Error;  // doesn't check if valueIsValid
    abstract valueToString(val: T): string;
    abstract valueIsValid(val: T): boolean;
    abstract objectIsReady(obj: any, thisFieldName: string): boolean;
}


// tasks to do
//  query for docs that match the spec
//      TODO: how, common path prefix?
//  for each returned doc
//      which field does it belong to?
//      assemble / insert into existing object
//  check if object is ready
//  on write:
//      check the value is valid
//      create an earthstar doc for each changed field


//================================================================================

interface StringFromContentOpts {
    path: string,
    maxLength?: number,  // default: no limit
    optional?: boolean,  // default: false
}
class _StringFromContent implements FieldValidator<string> {
    constructor(public opts: StringFromContentOpts) {}
    pathMatches(path: string): boolean {
        return pathMatches(this.opts.path, path);
    }
    contentToValue(content: string): string | Error {
        return content;
    }
    valueToString(val: string): string {
        return val;
    }
    valueIsValid(val: string): boolean {
        if (val === '') { return false; }
        if (typeof this.opts.maxLength === 'number' && val.length > this.opts.maxLength) {
            return false;
        }
        return true;
    }
    objectIsReady(obj: Record<string, any>, fieldName: string): boolean {
        let optional = this.opts.optional ?? false;
        return (optional || obj[fieldName] !== undefined);
    }
}
let StringFromContent = (opts: StringFromContentOpts) =>
    new _StringFromContent(opts);

//================================================================================

let nop = (...args: any[]) => {};
let stringFromPath = nop;
let booleanFromContent = nop;
let stringFromContent = nop;
let integerFromContent = nop;

interface Todo2 {
    id: string,
    done: boolean,
    text: string,
    priority?: number,
}

let TodoSpec2 = {
    id: stringFromPath({
        path: '/todos/v1/id:{id}/*',
        minLength: 5,
        maxLength: 50,
    }),
    done: booleanFromContent({
        path: '/todos/v1/id:*/done.json',
    }),
    text: StringFromContent({
        path: '/todos/v1/id:*/text.txt',
        maxLength: 200,
    }),
    priority: integerFromContent({
        path: '/todos/v1/id:*/priority.json',
        min: 0,
        max: 5,
        optional: true,
    }),
}

let todoSpec7 = {
    _path: '/todos/v1/{id}/{filename}/',
    id: new StringField({
        path: { 'id': '*'},
        minLength: 5,
        maxLength: 200
    }),
    text: new StringField({
        path: { 'filename': 'text.txt' },
        maxLength: 200,
    }),
    done: new BooleanField({
        pathField: { 'filename': 'done.json' },
    }),
    priority: new IntegerField({
        pathField: { 'filename': 'priority.json' },
        min: 0,
        max: 1,
        required: false,
    }),
}

// query first approach
let storage: any = 123;
let todoCollection = new Map<string, Todo>();
let todoLeftovers = new Map<string, Todo>();
let docs = storage.documents({
    pathStartsWith: '/todos/v1/id:',
});


/*
for (let doc of docs) {
    let { id, filename } = extract(doc.path, '/todos/v1/{id}/{filename}');
    if (!idField.validate(id)) { continue }
    let todo: Partial<Todo> = todoCollection.get(id) || todoLeftovers.get(id) || { id };
    if (filename === 'text.txt') {
        updateField(textField, todo, doc.content);
    } else if (filename === 'done.json') {
        updateField(doneField, todo, doc.content);
    } else if (filename === 'priority.json') {
        updateField(priorityField, todo, doc.content);
    }
    if (isComplete(todo)) {
        todoLeftovers.remove(id);
        todoCollection.set(id, todo as Todo)
    } else {
        todoCollection.remove(id);
        todoLeftovers.set(id, todo)
    }
]
*/

// queryForAll
// pathIsValid -- given a doc's path, is it valid for this field?
// contentIsValid -- given a doc's content, is it valid for this field?
// objectIsComplete -- given the final domain object, is it ready and complete?


//  
//  
//  todoSpec = new Spec({
//      path: '/todos/v1/{id}/{filename}'
//  }, {
//      id {
//          pathWildcard: 'id'
//      }
//      done {
//          pathWildcard: ['filename', 'done.json']
//      }
//      text {
//          pathWildcard: ['filename', 'text.txt']
//      }
//  });
//  
//  todoSpec = {
//      id: {
//          path: '/todos/v1/*/'
//      }
//      done: {
//          path: '/todos/v1/{id}/done.json'
//      }
//      text: {
//          path: '/todos/v1/{id}/text.txt'
//      }
//  }
//  
//  
//  
//  
//  



/*
// D is domain object such as a Todo
// These are the basic pieces you have to provide to make a layer
abstract class LayerParts<D> {

    // if id is '*', query for all possible docs we care about
    abstract queryForDocs(id: Id): Query;

    // filter the query results to only the ones we want
    abstract docIsRelevant(id: Id, doc: Document): boolean;

    // merge any relevant docs into the index
    // which will emit events from index.ready.on('added' | 'added' | 'deleted')
    abstract updateIndex(doc: Document, index: Index<D>): void;

    // return a set of docs we should save to the storage
    // TODO: this needs to be more specific, like only editing certain properties of a domain object...
    // maybe it needs to be an API of methods?
    abstract docsForSetState(id: Id, domainObject: Partial<D>): DocToSet[];
}
*/

