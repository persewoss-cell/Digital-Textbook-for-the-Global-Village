import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

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
// Stroke의 penStyleId처럼 "이 획엔 해당 없음"을 자바스크립트 값 undefined로 표현하는
// 선택 필드가 있는데, Firestore는 기본적으로 undefined 필드가 섞인 객체를 그대로
// 저장하려 하면 에러를 던지고 그 문서 쓰기 자체를 실패시킨다. saveAnnotation처럼
// 결과를 기다리지 않고 실행(fire-and-forget)하는 저장 호출이 조용히 실패하면 학생이
// 그린 필기가 화면에는 남아 있어도 서버에는 저장되지 않은 것처럼 보이는 문제가
// 있었다 - ignoreUndefinedProperties를 켜서 그런 필드를 에러 없이 그냥 건너뛰게 한다.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
