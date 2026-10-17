const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const executable = path.resolve(process.argv[2] || path.join(__dirname,'release/win-unpacked/MemeAim 3D.exe'));
const output = path.resolve(__dirname,'smoke-result.json');
if(fs.existsSync(output))fs.unlinkSync(output);
const env = {...process.env,MEMEAIM_SMOKE_RESULT:output};
delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(executable,['--smoke-test'],{env,windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>{child.kill();console.error('Desktop smoke timed out');process.exitCode=1;},90000);
child.on('error',error=>{clearTimeout(timer);console.error(error);process.exitCode=1;});
child.on('exit',code=>{
  clearTimeout(timer);
  const result=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):null;
  console.log(JSON.stringify(result,null,2));
  if(code!==0||!result?.ok)process.exitCode=1;
});
