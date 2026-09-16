# 🌍 지구마을 디지털 교과서

3~6학년 "지구마을" 시리즈를 위한 디지털 교과서 웹앱입니다. React + Firebase로 만들어졌습니다.

## 주요 기능

- **로그인/가입**: 첫 화면은 로그인 화면이며, 학생/선생님 구분 로그인, 가입하기, 관리자 로그인 버튼이 있습니다.
  - 가입 시 학생은 학년·반·번호·이름·비밀번호(알파벳 4자리)를 입력하고, 선생님은 학년·반(담당 반)·이름·비밀번호를 입력합니다.
  - 학생 가입은 **담임 선생님 승인**, 선생님 가입은 **관리자 승인**이 필요합니다.
- **학생**: 로그인하면 자기 학년에 맞는 교과서 목록으로 이동하고, 책처럼 펼쳐지는 뷰어로 학습합니다.
- **선생님**: 학생 기능을 모두 포함하며, 추가로
  - 학급 현황(진도율 모니터링, 학생별 학습 화면 열람)
  - 가입 승인(자기 반으로 신청한 학생만)
  - 학생 일괄 등록(번호,이름,비밀번호 붙여넣기로 여러 명 한 번에 등록, 바로 활성화)
  을 사용할 수 있습니다.
- **관리자**: 모든 사용자 관리(정보 수정, 비밀번호 초기화, 정지/삭제, 승인), 학급-담임 배정, 교과서(PDF) 업로드 및 목차 관리, 관리자 계정 추가, 자기 비밀번호 변경 등 전체 관리 기능을 사용할 수 있습니다.

### 디지털 교과서 뷰어 기능

- 책처럼 좌우로 펼쳐지는 페이지 넘김 애니메이션 (react-pageflip 기반)
- **두 쪽 보기 / 한 쪽 크게 보기** 전환
- 확대/축소, 쪽 번호 이동
- 왼쪽 **목차** 패널 (단원별 이동), **책갈피** 목록
- 오른쪽 **노트(입력란)** 패널 — 쪽마다 자동 저장되는 메모장
- 펜/형광펜 필기 도구 (여러 색상, 지우기) — 학생별로 저장되어 다시 펼치면 그대로 보임
- 책갈피(즐겨찾기), 교재 내 **검색** (실제 PDF 텍스트 기반, 결과 클릭 시 이동)
- **읽어주기(TTS)**: 현재 쪽 본문을 음성으로 읽어줌
- **고대비 모드**, **읽기 자(줄 따라가기 가이드)** 같은 읽기 보조 기능
- 인쇄, 학습 진도 자동 기록(마지막 읽은 쪽, 읽은 쪽 비율)
- 선생님이 학생 화면을 열람할 때는 **읽기 전용 모드**로 동일한 필기/노트를 확인할 수 있음

## 기술 스택

- React 18 + TypeScript + Vite + Tailwind CSS
- React Router
- Firebase Auth / Firestore / Storage / Cloud Functions (Admin SDK)
- pdfjs-dist (PDF 렌더링), react-pageflip-enhanced (책 넘김 UI)

## 로그인 구조 안내 (중요)

학생·선생님은 이메일이 아니라 **학년/반/번호/이름 + 4자리 비밀번호**로 로그인합니다. 내부적으로는
`학년-반-번호` 조합으로 만든 가상의 이메일(`s-3-2-15@accounts.gvtextbook.internal` 형태)과, Firebase Auth의
최소 비밀번호 길이(6자)를 맞추기 위해 뒤에 고정 문자열을 붙인 비밀번호로 Firebase Authentication을 사용합니다.

- 고정 패딩 문자열은 `.env`의 `VITE_PASSWORD_PAD`와 `functions/src/constants.ts`의 `PASSWORD_PAD`에 **동일하게** 들어있어야 합니다.
- 서비스를 시작한 뒤에는 이 값을 바꾸지 마세요. 바꾸면 기존에 만들어진 모든 계정이 로그인할 수 없게 됩니다.

관리자는 실제 이메일/비밀번호로 로그인합니다.

## Firebase 프로젝트 설정 방법

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 새 프로젝트를 만듭니다.
2. **Authentication** → 로그인 방법에서 **이메일/비밀번호**를 사용 설정합니다.
3. **Firestore Database**를 만듭니다 (프로덕션 모드로 시작해도 됩니다. 규칙은 이 저장소의 `firestore.rules`를 배포하면 됩니다).
4. **Storage**를 만듭니다 (교과서 PDF 저장용).
5. **Functions**를 사용하려면 프로젝트를 Blaze(종량제) 요금제로 업그레이드해야 합니다 (Cloud Functions 배포 요건).
6. 프로젝트 설정 > 일반 > 내 앱에서 웹 앱을 추가하고, 표시되는 설정 값을 `.env` 파일에 채워넣습니다 (`.env.example` 참고).
7. `.firebaserc`의 `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID`를 실제 프로젝트 ID로 바꿉니다.

```bash
npm install -g firebase-tools   # 아직 없다면
firebase login

npm install                     # 루트 (웹앱) 의존성 설치
cp .env.example .env            # 값 채워넣기

cd functions && npm install && cd ..   # Cloud Functions 의존성 설치

firebase deploy --only firestore:rules,storage:rules,functions
npm run build
firebase deploy --only hosting
```

## 로컬 개발

```bash
npm install
cp .env.example .env   # Firebase 웹 설정 값 채우기
npm run dev
```

## 최초 관리자 계정 만들기

1. 배포 후(또는 로컬 개발 서버에서) `/admin/login` 페이지로 이동합니다.
2. "처음 사용하시나요? 최초 관리자 계정 만들기"를 눌러 이름/이메일/비밀번호를 입력합니다.
3. 이 기능은 **관리자 계정이 한 명도 없을 때만** 동작합니다. 이후에는 관리자 페이지의 "관리자 설정" 탭에서 추가 관리자를 만들 수 있습니다.

## 교과서(PDF) 업로드 방법

1. 관리자로 로그인 → 관리자 페이지 → **교과서 관리** 탭
2. 학년, 과목/시리즈명, 교재 제목을 입력하고 PDF 파일을 선택해 업로드합니다.
3. 업로드된 교과서의 "목차 관리"를 눌러 단원 제목과 시작 쪽 번호를 등록하면, 학생/선생님 화면 왼쪽 목차에 표시됩니다.

## 학급/선생님 배정

1. 관리자 페이지 → **학급 관리** 탭에서 학년/반을 추가합니다. (학생이나 선생님이 가입하면 자동으로도 만들어집니다.)
2. 각 학급에 담임 선생님을 지정하면, 그 선생님이 해당 반 학생의 가입 승인과 학습 모니터링을 할 수 있습니다.

## 프로젝트 구조

```
src/
  pages/
    LoginPage.tsx, SignupPage.tsx, AdminLoginPage.tsx
    TextbookHome.tsx                 # 교과서 목록
    TextbookViewer/                  # 책 뷰어 (툴바, 목차, 노트, 필기 레이어 등)
    TeacherDashboard/                # 학급 현황, 가입 승인, 일괄 등록
    AdminDashboard/                  # 사용자/학급/교과서/설정 관리
  lib/                               # Firebase 연동, 인증, Firestore 헬퍼
  context/AuthContext.tsx
  types/
functions/
  src/index.ts                      # 관리자 권한이 필요한 모든 계정 작업(Admin SDK)
firestore.rules / storage.rules / firebase.json
```

## 참고 / 설계 메모

- 학생 가입은 담임 승인, 선생님 가입은 관리자 승인을 거치도록 설계했습니다(무분별한 가입 방지). 정책을 바꾸고 싶다면 `functions/src/index.ts`의 `signup`과 승인 로직을 수정하세요.
- 필기/노트/책갈피/진도는 Firestore에 학생별로 저장되며, 선생님은 자기 반 학생 것만, 관리자는 전체를 볼 수 있도록 보안 규칙(`firestore.rules`)에서 제한합니다.
- 교재 PDF는 별도 이미지 변환 없이 `pdfjs-dist`로 브라우저에서 직접 렌더링합니다.
