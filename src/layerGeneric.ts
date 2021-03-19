import {
    Query,
    Document,
    DocToSet,
} from 'earthstar';
import {
    Collection
} from './collection'

//================================================================================
// basic ingredients for making layers

// Id is like "todo:123" or "post:abc" or 'post:*' or '*'
type Id = string;

// Layers that have indexes will have two collections:
// completed/ready domain objects, and
// incomplete domain objects where we don't have all the docs for them yet.
// TODO: how can we have more specific collections like Todos, Posts, etc?
interface Index<T> {
    ready: Collection<T>;
    unfinished: Collection<T>;
}

// D is domain object such as a Todo
// These are the basic pieces you have to provide to make a layer
interface LayerParts<D> {
    // if id is '*', query for all possible docs we care about
    queryForDocs: (id: Id) => Query,

    // filter the query results to only the ones we want
    filterDocsForRelevance: (id: Id, docs: Document[]) => Document[],

    // make a single domain object out of a set of docs
    mergeIntoDomainObject: (id: Id, filteredDocs: Document[]) => D,

    // merge any relevant docs into the index
    // which will emit events from index.ready.on('added' | 'added' | 'deleted')
    updateIndex: (docs: Document[], index: Index<D>) => void,

    // return a set of docs we should save to the storage
    // TODO: this needs to be more specific, like only editing certain properties of a domain object...
    // maybe it needs to be an API of methods?
    write: (id: Id, domainObject: D) => DocToSet[],
}

//================================================================================
// Given the basic pieces above, we can assemble them into these more complicated
// kinds of Layers:

class StatelessLayer<D> {
    constructor(public _layerParts: LayerParts<D>) {
    }
}

class PreIndexedLayer<D> {
    constructor(public _layerParts: LayerParts<D>) {
    }
}

class IndexOnDemandLayer<D> {
    constructor(public _layerParts: LayerParts<D>) {
    }
}
