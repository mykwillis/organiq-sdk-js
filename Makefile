##
## npm install -g browserify
##

all: browserify

browserify:
	browserify -r ./lib/index.js:organiq --exclude ./package.json --exclude nodejs-websocket -o build/organiq.js

