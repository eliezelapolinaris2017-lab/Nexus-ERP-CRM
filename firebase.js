// firebase.js (ES Modules)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref as sref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* ====== PON TUS KEYS AQUÍ ====== */
const firebaseConfig = {
  apiKey: "AIzaSyDA9Al--d5KmCy2AJd9StOy2wKYgWTttLY",
  authDomain:  "nexus-erp-crm.firebaseapp.com",
  projectId:  "nexus-erp-crm",
  storageBucket: "nexus-erp-crm.firebasestorage.app",
  messagingSenderId: "474380232021",
  appId: "1:474380232021:web:4a760d73ea4a1503f2fbdc"
};
/* ================================= */

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
export const stg  = getStorage(app);

// Offline (opcional): cache Firestore
try { await enableIndexedDbPersistence(db); } catch (e) { /* ok */ }

// Helpers Auth
export const authApi = {
  onAuthStateChanged,
  login: (email, pass)=>signInWithEmailAndPassword(auth, email, pass),
  signup: (email, pass)=>createUserWithEmailAndPassword(auth, email, pass),
  reset: (email)=>sendPasswordResetEmail(auth, email),
  logout: ()=>signOut(auth)
};

// Firestore helpers base
export const fx = {
  // paths por tenant (uid)
  col: (uid, path)=>collection(db, `tenants/${uid}/${path}`),
  doc: (uid, path, id)=>doc(db, `tenants/${uid}/${path}/${id}`),
  add: (uid, path, data)=>addDoc(collection(db, `tenants/${uid}/${path}`), {...data, _ts:serverTimestamp()}),
  set: (uid, path, id, data)=>setDoc(doc(db, `tenants/${uid}/${path}/${id}`), {...data, _ts:serverTimestamp()}),
  del: (uid, path, id)=>deleteDoc(doc(db, `tenants/${uid}/${path}/${id}`)),
  getDocs: (uid, path)=>getDocs(collection(db, `tenants/${uid}/${path}`)),
  on: (uid, path, cb, opt={})=>{
    let q = collection(db, `tenants/${uid}/${path}`);
    if(opt.orderBy) q = query(q, orderBy(opt.orderBy, opt.dir||'asc'));
    return onSnapshot(q, cb);
  }
};

// Storage helpers
export const storageApi = {
  uploadLogo: async (uid, file)=>{
    const r = sref(stg, `tenants/${uid}/brand/logo`);
    await uploadBytes(r, file);
    return await getDownloadURL(r);
  }
};
