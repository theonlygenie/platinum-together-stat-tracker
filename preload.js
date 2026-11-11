const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('stats', {
  load: () => ipcRenderer.invoke('stats:load'),
  pick: () => ipcRenderer.invoke('stats:pick'),
  tag: (file, world) => ipcRenderer.invoke('stats:tag', file, world),
  tagMany: (files, world) => ipcRenderer.invoke('stats:tagMany', files, world),
  wikiGet: () => ipcRenderer.invoke('wiki:get'),
  wikiCheck: () => ipcRenderer.invoke('wiki:check'),
  wikiSet: on => ipcRenderer.invoke('wiki:set', on),
  archiveGet: () => ipcRenderer.invoke('archive:get'),
  archiveSet: (which, on) => ipcRenderer.invoke('archive:set', which, on),
  icons: () => ipcRenderer.invoke('stats:icons'),
  itemIcons: () => ipcRenderer.invoke('stats:itemIcons'),
  shinyFronts: () => ipcRenderer.invoke('stats:shinyFronts'),
  townMap: () => ipcRenderer.invoke('map:image'),
  mapLoad: () => ipcRenderer.invoke('map:load'),
  mapSave: assign => ipcRenderer.invoke('map:save', assign),
  nameSpecies: (id, name) => ipcRenderer.invoke('stats:name', id, name),
});
