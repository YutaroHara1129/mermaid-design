'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {assertNoSourceAlias}=require('../scripts/diagram.cjs');
function testSourceAliases() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mermaid-source-alias-'));
  try {
    const source=path.join(dir,'example.svg'),bytes=Buffer.from('flowchart LR\nA-->B\n');
    fs.writeFileSync(source,bytes);
    const result=spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/diagram.cjs'),'render',source,'--out-dir',dir],{encoding:'utf8'});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/Output aliases a source file/);
    assert.deepEqual(fs.readFileSync(source),bytes);
    assert.equal(fs.existsSync(path.join(dir,'example.render.json')),false);
    const link=path.join(dir,'other.svg');fs.linkSync(source,link);
    assert.throws(()=>assertNoSourceAlias([source],dir,['other.svg']),/Output aliases a source file/);
    const separate=path.join(dir,'separate.svg');fs.writeFileSync(separate,'unrelated bytes');
    assert.doesNotThrow(()=>assertNoSourceAlias([source],dir,['separate.svg','not-created.svg']));
    assert.deepEqual(fs.readFileSync(source),bytes);
    return {checks:3,sourceUnchanged:true,browserLaunched:false};
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
if(require.main===module)console.log(JSON.stringify(testSourceAliases()));
module.exports=testSourceAliases;
