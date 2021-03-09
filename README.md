# Earthtar Layer Experiments

Experiments with different ways of structuring Layer classes for Earthstar.

A Layer's job is to sit between Earthstar's low-level storage and a high-level
application, converting complex data structures into a series of Earthstar
documents and back, and providing an API for getting, setting, and querying.

These are all Layers for an imaginary task list application (e.g. todos).

Most of them omit the actual reading and writing to Earthstar
because we're more interested in how they track changes in the layer
and how the app can subscribe to those changes.
