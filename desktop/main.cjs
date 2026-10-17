const {app,BrowserWindow,Menu,protocol,session,dialog} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {createAssetHandler} = require('./asset-server.cjs');
const smoke = process.argv.includes('--smoke-test');
app.setName('MemeAim 3D-DeepSeek V41');
app.setPath('userData',path.join(app.getPath('appData'),'MemeAim 3D-DeepSeek V41'));
if (smoke) app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'memeaim-smoke-')));
app.setAppUserModelId('io.github.passerbyask.memeaim.dpsk');
protocol.registerSchemesAsPrivileged([{scheme:'memeaim',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let window;
function trusted(url) { try { const u=new URL(url);return u.protocol==='memeaim:'&&u.host==='app'; } catch { return false; } }

app.whenReady().then(async()=>{
  const root = app.isPackaged ? path.join(process.resourcesPath,'web') : path.resolve(__dirname,'../dpsk/dist');
  protocol.handle('memeaim',createAssetHandler(root));
  const allowed = (contents,permission) => !!contents && trusted(contents.getURL()) && ['pointerLock','fullscreen'].includes(permission);
  session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>callback(allowed(contents,permission)));
  session.defaultSession.setPermissionCheckHandler((contents,permission)=>allowed(contents,permission));
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({width:1440,height:960,minWidth:900,minHeight:640,title:'MemeAim 3D-DeepSeek V41',backgroundColor:'#101419',icon:path.join(__dirname,'icon.ico'),show:!smoke,
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:false,backgroundThrottling:!smoke,offscreen:smoke}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('page-title-updated',event=>{event.preventDefault();window.setTitle('MemeAim 3D-DeepSeek V41 v'+app.getVersion());});
  window.webContents.on('will-navigate',(event,url)=>{if(!trusted(url))event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key==='F11'){window.setFullScreen(!window.isFullScreen());event.preventDefault();}});
  const errors=[];
  window.webContents.on('console-message',(_event,details)=>{if(details.level==='error')errors.push(details.message);});
  await window.loadURL('memeaim://app/'+(smoke?'?test=1':''));
  if(smoke) {
    const result = await require('./smoke-dpsk.cjs')(window);
    if(errors.length)throw new Error(errors.join('\n'));
    fs.writeFileSync(process.env.MEMEAIM_SMOKE_RESULT||path.join(os.tmpdir(),'memeaim-smoke-result.json'),JSON.stringify({ok:true,...result},null,2));
    app.exit(0);
  }
}).catch(error=>{
  if(smoke){fs.writeFileSync(process.env.MEMEAIM_SMOKE_RESULT||path.join(os.tmpdir(),'memeaim-smoke-result.json'),JSON.stringify({ok:false,error:error.stack}));app.exit(1);}
  else {dialog.showErrorBox('MemeAim 3D-DeepSeek V41 无法启动',String(error.message));app.quit();}
});
app.on('window-all-closed',()=>app.quit());
