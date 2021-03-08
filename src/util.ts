import equal from 'fast-deep-equal';
import clone from 'rfdc';

export let deepEqual = equal;
export let deepCopy = clone();

export let log = console.log;
    
export let sleep = (ms: number) => {
    return new Promise((res, rej) => {
        setTimeout(res, ms);
    });
}
