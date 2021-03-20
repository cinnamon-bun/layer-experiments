/*
Todo
    id: string
        inferred from path
    done: boolean
        required
        non-empty
        read from content at: '/todos/v1/{id}/done.json'
        (content) => content === 'true'
    text: string
        required
        non-empty
        read from content at: '/todos/v1/{id}/text.txt'
*/

//================================================================================

enum Spec {
    // type
    BOOLEAN,
    STRING,
    INTEGER,
    // from: how to obtain
    PATH_WITH_NAME,  // e.g. "/todos/v1/id:{id}/..."
    PATH_PATTERN,  // e.g. "/todos/v1/{id}/*"
    CONTENT,  // from the doc.content
    // required?
    REQUIRED,  // object is only valid if it has this field
    OPTIONAL,  // object is valid without this field
}

type SpecType = Spec.BOOLEAN | Spec.STRING | Spec.INTEGER;
type SpecFrom = Spec.PATH_WITH_NAME | Spec.PATH_PATTERN | Spec.CONTENT;
type SpecRequired = Spec.REQUIRED | Spec.OPTIONAL;

type FromString = <T>(x: string) => T;
type ToString = <T>(x: T) => string;

interface SpecExtras {
    fromString?: FromString,
    toString?: ToString,
    maxLength?: number,  // in string form
    minLength?: number,
}
interface SpecFieldNoPath extends SpecExtras {
    type: SpecType,
    from: Spec.PATH_WITH_NAME | Spec.PATH_PATTERN,
    required: SpecRequired,
}
interface SpecFieldWithPath extends SpecExtras {
    path: string,
    type: SpecType,
    from: Spec.CONTENT,
    required: SpecRequired,
}
type SpecField = SpecFieldNoPath | SpecFieldWithPath;
type SpecObj = Record<string, SpecField>;

//================================================================================

interface Todo {
    id: string,
    done: boolean,
    text: string,
}

let TodoSpec: SpecObj = {
    id: {
        type: Spec.STRING,
        from: Spec.PATH_WITH_NAME,
        required: Spec.REQUIRED,
    },
    done: {
        path: '/todos/v1/id:{id}/done.json',
        type: Spec.BOOLEAN,
        from: Spec.CONTENT,
        required: Spec.REQUIRED,
    },
    text: {
        path: '/todos/v1/id:{id}/text.txt',
        type: Spec.STRING,
        from: Spec.CONTENT,
        required: Spec.REQUIRED,
    }
}



