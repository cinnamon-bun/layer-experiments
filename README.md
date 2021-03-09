# Earthstar Layer Experiments

Experiments with different ways of structuring Layer classes for Earthstar.

## What's a Layer

A Layer's job is to sit between Earthstar's low-level storage and a high-level
application, converting complex data structures into a series of Earthstar
documents and back, and providing an API for getting, setting, and querying.

## Our imaginary app

These are all Layers for an imaginary task list application (e.g. todos).

`App ---(Task objects)--- Layer ---(earthstar docs)--- Earthstar Storage`

Most of them omit the actual reading and writing to Earthstar
because we're more interested in how they track changes in the layer
and how the app can subscribe to those changes.

## The experiments

The `output` folder has the results of running each Layer's example code, for
easy reading, but you will probably also want to read the code and comments in
each file at `src/layer*.ts`.

Mostly we're assuming a Layer will have some kind of internal state that an app will need to subscribe to.

**`LayerEventBus`**

Apps subscribe to a variety of fine-grained events in an event bus.  The layer has to remember to send these events.

**`LayerState`**

The layer has a single State object which it mutates, and apps are notified whenever the entire State changes.  The layer has to remember to trigger the state notifier after every change.

**`LayerProxyValtio`**

Using the [`valtio`](https://www.npmjs.com/package/valtio) package, the app has a single State object which it mutates, and apps can subscribe to the entire State or any smaller part of it.  The layer does not have to do anything special, it can just mutate the State.

**`LayerEarthstarAutoProxy`**

This is the only one that's actually hooked up to Earthstar underneath.

It uses a proxy wrapper around the Earthstar Storage which tracks which documents have been accessed, and lets the app subscribe to changes in only those documents.

For example, a React component that only renders one Task item would only read a few specific documents, and would only re-render when those documents change.

See `earthstarAutoProxy.ts` for the proxy code.
