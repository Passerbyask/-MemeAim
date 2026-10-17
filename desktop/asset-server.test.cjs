const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const {assetPath,createAssetHandler}=require('./asset-server.cjs');
test('packaged origin cannot read outside assets',()=>{
  const root=path.resolve('assets');
  assert.equal(assetPath(root,'memeaim://app/'),path.join(root,'index.html'));
  for(const url of ['https://app/index.html','memeaim://evil/index.html','memeaim://app/%2e%2e%2fsecret.txt','memeaim://app/%5csecret.txt','memeaim://app/C%3A/file.txt','memeaim://app/%00.txt'])assert.throws(()=>assetPath(root,url));
});
test('offline media supports range, MIME and missing-file responses',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'memeaim-assets-'));
  try{
    await fs.writeFile(path.join(root,'clip.mp4'),Buffer.from([1,2,3,4]));
    const serve=createAssetHandler(root);
    let r=await serve(new Request('memeaim://app/clip.mp4',{headers:{range:'bytes=1-2'}}));
    assert.equal(r.status,206);assert.equal(r.headers.get('content-type'),'video/mp4');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[2,3]);
    r=await serve(new Request('memeaim://app/clip.mp4',{headers:{range:'bytes=9-'}}));assert.equal(r.status,416);
    assert.equal((await serve(new Request('memeaim://app/missing.js'))).status,404);
    assert.equal((await serve(new Request('memeaim://app/clip.mp4',{method:'POST'}))).status,405);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
