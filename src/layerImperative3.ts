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
    queryMatchesDoc,
} from 'earthstar';
import { true } from 'tap';
import {
    Collection
} from '../src/collection'
import { sleep } from '../src/utils';

//================================================================================

interface StringFieldOpts {
    useWhen: 'ALWAYS' | [string, string],  // [template, value]
    valueFrom: 'DOC_CONTENT' | string, // template
    required?: boolean, // default true
    minLength?: number,
    maxLength?: number,
}
class StringField {
    constructor(public opts: StringFieldOpts) {

    }
}

//================================================================================

interface Spec {
    pathTemplate: string,
    fields: {
        [key: string]: StringField,
    }
}
interface Todo7 {
    id: string,
    text: string,
}
let todoSpec: Spec = {
    pathTemplate: '/todos/v1/{id}/{filename}',
    fields: {
        id: new StringField({
            useWhen: 'ALWAYS',
            valueFrom: '{id}',
        }),
        text: new StringField({
            useWhen: ['{filename}', 'text.txt'],
            valueFrom: 'DOC_CONTENT',
        })
    }
}

//================================================================================

type FilterFn = (doc: Document) => boolean;
interface QueryAndFilterFn {
    query: Query,
    filterFn: FilterFn,
}

class SpecHandler<T> {
    constructor(public spec: any) {
    }
    queryAllDocs(): QueryAndFilterFn {
        // build a query based on the pathTemplate
        return null as any; // TODO
    }
    queryDocsForId(fieldName: string, value: string): QueryAndFilterFn {
        // build a query based on the pathTemplate
        // but with {fieldName} replaced with value
        return null as any; // TODO
    }
    docToPartialObj(doc: Document): Partial<T> {
        // convet an earthstar document to a partial domain object
        // using the Field classes
        return null as any; // TODO
    }
    objIsComplete(partialObj: Partial<T>): boolean {
        // given an actual domain object,
        // check if all the required fields are present
        return true; // TODO
    }
    validateObj(obj: T): Error | true {
        // given an actual domain object,
        // check if all the fields are valid
        return true; // TODO
    }
    setState(partialObj: Partial<T>): DocToSet[] {
        // given a partial obj,
        // convert it into one or more Earthstar docs to write
        return []; // TODO
    }
}

//================================================================================
/*

given a spec,
    generate a query for all matching docs
    and a filter function

given a spec and an id,
    generate a query for all docs about that id
    and a filter function

given a doc,
    parse its path
    build up a partial Todo

given some partial todos
    merge them

given a Todo
    validate it

given a partial Todo as a setState write operation,
    validate it
    generate doc(s)

*/



