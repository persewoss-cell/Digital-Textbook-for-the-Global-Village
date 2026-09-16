import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase 웹 설정값은 비밀값이 아니라 클라이언트 코드에 그대로 포함되는 값이라
// (실제 접근 제어는 Firestore 보안 규칙이 담당) 기본값으로 하드코딩해 두었습니다.
// .env로 덮어쓰면 다른 프로젝트로 바꿔서 개발할 수도 있어요.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDpbY6e_K814qUhFmPeYr0Vt1GShJdFvcw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "digital-tb-global-village.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "digital-tb-global-village",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "647957775402",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:647957775402:web:93d615da6f05b7a75c2f53",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
