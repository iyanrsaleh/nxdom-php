/** Hanya untuk Node (index.js). Browser dapat endpoint lewat window.__NEXA_ENDPOINT__ di HTML — GET /config.js diblokir. */
const config = { 
  url: "http://demo.local",
  urlApi: "http://demo.local/api",        //  url jika menggunakan drive backend Nexa Dom Framework
  drive: "http://demo.local/assets/drive", // url jika menggunakan drive backend Nexa Dom Framework
  typicode: "https://jsonplaceholder.typicode.com/photos?_limit=5",// url typicode backend umum baca dokuentasi NXUI.Storage().api(row, body)
  firebaseConfig:false, // jika tidak menggunakan firebase backend maka isi dengan false
  // Baca dokumentasi NXUI.Inisiasi: App.js
  // sesuaikan dengan backend yang digunakan degan nama yan kamu butuhkan dan cek di NEXA.apikamu
  // variabel apikamu:'http://demo.local:/api_kamu';
  // variabel apidrive_kamu:'http://demo.local/assets/drive_kamu';
};

export default config;
