const Module = require('module');
const path = require('path');

const distRoot = path.resolve(__dirname);
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveWorkerAlias(request, parent, isMain, options) {
  if (typeof request === 'string' && request.startsWith('@/')) {
    return originalResolveFilename.call(
      this,
      path.join(distRoot, request.slice(2)),
      parent,
      isMain,
      options,
    );
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};
