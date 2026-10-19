// A single local Worker owns SQLite; the separate admin dev server proxies to it.
// Production uses two independent Workers sharing the remote D1 binding.
export default {
  root: 'admin-ui',
  server: {host:'127.0.0.1',port:5179,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:8787',rewrite:path=>`/_local-admin${path}`}}},
};
