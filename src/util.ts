
export let log = console.log;

export let sleep = (ms: number) => {
    return new Promise((res, rej) => {
        setTimeout(res, ms);
    });
}
