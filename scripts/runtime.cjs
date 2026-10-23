const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
// Standard npm layout is also supported for development; installed skills use the hidden runtime.
module.exports=fs.existsSync(path.join(root,'.runtime/node_modules/mermaid')) ?
  createRequire(path.join(root,'.runtime/package.json')) : createRequire(path.join(root,'package.json'));
