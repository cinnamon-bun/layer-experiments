#!/usr/bin/env sh

# can add --watch to this
node_modules/.bin/esbuild ./src/*.ts --outdir=build --format=cjs --platform=node --target=node12 $1 $2 $3 $4 $5
