const {app,BrowserWindow,Menu,protocol,session,dialog,ipcMain} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {createAssetHandler} = require('./asset-server.cjs');
const {DsuClient}=require('./dsu.cjs');
const smoke = process.argv.includes('--smoke-test');
if (smoke) app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'memeaim-smoke-')));
app.setAppUserModelId('io.github.passerbyask.memeaim');
protocol.registerSchemesAsPrivileged([{scheme:'memeaim',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let window,dsu;
function trusted(url) { try { const u=new URL(url);return u.protocol==='memeaim:'&&u.host==='app'; } catch { return false; } }

app.whenReady().then(async()=>{
  const root = app.isPackaged ? path.join(process.resourcesPath,'web') : path.resolve(__dirname,'../web/dist');
  protocol.handle('memeaim',createAssetHandler(root));
  const allowed = (contents,permission) => !!contents && trusted(contents.getURL()) && ['pointerLock','fullscreen','hid'].includes(permission);
  session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>callback(allowed(contents,permission)));
  session.defaultSession.setPermissionCheckHandler((contents,permission)=>allowed(contents,permission));
  session.defaultSession.on('select-hid-device',(event,details,callback)=>{
    event.preventDefault();
    if(!window||!trusted(window.webContents.getURL())){callback('');return;}
    const devices=details.deviceList.filter(d=>d.vendorId===0x054c&&[0x0ce6,0x0df2].includes(d.productId)).slice(0,8);
    if(!devices.length){callback('');return;}
    dialog.showMessageBox(window,{type:'question',title:'连接陀螺仪',message:'选择用于读取运动数据的 DualSense',buttons:[...devices.map(d=>d.name||d.productName||'DualSense'),'取消'],cancelId:devices.length}).then(result=>callback(devices[result.response]?.deviceId||''),()=>callback(''));
  });
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({width:1440,height:960,minWidth:900,minHeight:640,title:'MemeAim 3D',backgroundColor:'#101419',icon:path.join(__dirname,'icon.ico'),show:!smoke,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:false,backgroundThrottling:!smoke,offscreen:smoke}});
  const sendMotion=sample=>{if(window&&!window.isDestroyed())window.webContents.send('motion:sample',sample);};
  dsu=new DsuClient(sendMotion,error=>sendMotion({error}));
  const validSender=event=>event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&trusted(event.senderFrame.url);
  ipcMain.handle('motion:connect',(event,options)=>{if(!validSender(event))throw new Error('Invalid motion request');return dsu.connect(options);});
  ipcMain.handle('motion:disconnect',event=>{if(!validSender(event))throw new Error('Invalid motion request');dsu.close();});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(!trusted(url))event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key==='F11'){window.setFullScreen(!window.isFullScreen());event.preventDefault();}});
  const errors=[];
  window.webContents.on('console-message',(_event,details)=>{if(details.level==='error')errors.push(details.message);});
  await window.loadURL('memeaim://app/');
  if(smoke) {
    const result = await require('./smoke.cjs')(window);
    if(errors.length)throw new Error(errors.join('\n'));
    fs.writeFileSync(process.env.MEMEAIM_SMOKE_RESULT||path.join(os.tmpdir(),'memeaim-smoke-result.json'),JSON.stringify({ok:true,...result},null,2));
    app.exit(0);
  }
}).catch(error=>{
  if(smoke){fs.writeFileSync(process.env.MEMEAIM_SMOKE_RESULT||path.join(os.tmpdir(),'memeaim-smoke-result.json'),JSON.stringify({ok:false,error:error.stack}));app.exit(1);}
  else {dialog.showErrorBox('MemeAim 3D 无法启动',String(error.message));app.quit();}
});
app.on('before-quit',()=>dsu?.close());
app.on('window-all-closed',()=>app.quit());
