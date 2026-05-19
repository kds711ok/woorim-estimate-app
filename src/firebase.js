import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDB2FZ947ZbE8nJjtH69Z7JbL82LGvggDk",
  authDomain: "woorim-estimate-app.firebaseapp.com",
  projectId: "woorim-estimate-app",
  storageBucket: "woorim-estimate-app.firebasestorage.app",
  messagingSenderId: "154662832677",
  appId: "1:154662832677:web:f3434d1bed6c30b8610dcc"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);