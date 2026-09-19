import { useState } from "react";
import { Modal } from "@/components/Modal";

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-sm font-bold text-brand-700">{title}</h3>
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

const TEACHER_SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "1. 반 방 만들기",
    items: [
      "첫 화면 \"선생님: 방 만들기\"에서 이름·학년·반·4자리 비밀번호를 입력해 방을 만들어요.",
      "새로 만든 방은 관리자가 승인해야 첫 화면 방 목록에 나타나고 학생이 찾아 들어올 수 있어요. 승인 전에도 선생님은 관리 화면에 들어가 학생을 미리 등록해 둘 수 있어요.",
      "방에 들어갈 때는 만들 때 정한 비밀번호를 입력해요. \"이 기기에서 비밀번호 기억하기\"를 체크하면 다음에는 바로 들어가져요.",
    ],
  },
  {
    title: "2. 방 관리 화면",
    items: [
      "화면 가운데에 학생들이 지금 보고 있는 쪽과 필기가 실시간 카드로 표시돼요. 카드를 누르면 그 학생의 화면을 실시간(읽기 전용)으로 크게 볼 수 있어요.",
      "\"학생 등록하기\": 번호·이름을 하나씩 입력해 등록하거나, 엑셀 파일로 한 번에 여러 명을 등록할 수 있어요(양식 샘플 다운로드 가능). 이미 있는 번호로 다시 등록하면 이름이 수정돼요.",
      "\"비밀번호 변경하기\": 현재 비밀번호 확인 후 새 4자리 비밀번호로 바꿀 수 있어요.",
      "\"방 삭제하기\": 방과 그 안의 모든 학생 필기·노트·진도가 함께 삭제되며 되돌릴 수 없어요.",
    ],
  },
  {
    title: "3. 관리자 페이지 (마스터 비밀번호 필요)",
    items: [
      "\"모든 방\" 탭: 모든 학급의 방을 한눈에 보고, 비밀번호를 몰라도 바로 관리 화면에 들어갈 수 있어요. 승인 대기 중인 방은 여기서 \"승인하기\"를 눌러 열어 줘요.",
      "\"교재 관리\" 탭: 학년/과목/제목을 입력해 새 교재를 등록해요. 이 프로젝트는 무료 요금제라 PDF를 화면에서 바로 올릴 수 없어서, 파일 이름을 확인한 뒤 그 PDF를 개발자(Claude)에게 채팅으로 보내면 실제로 반영돼요.",
      "등록된 교재의 \"목차 관리\"에서 \"자동으로 후보 찾기\"로 PDF 속 실제 차례를 자동 추출하거나 직접 단원 제목·시작 쪽을 입력/수정할 수 있어요.",
    ],
  },
  {
    title: "4. 학년별 교재 체험하기",
    items: [
      "실제 방을 만들지 않고도 3~6학년 교재를 학생 화면과 똑같이 미리 둘러볼 수 있어요.",
      "여기서 한 필기·메모·확대 등은 저장되지 않고, 나가면 사라져요(연습/시연용).",
    ],
  },
];

const STUDENT_SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "1. 방 참여하기",
    items: [
      "선생님이 알려준 방을 첫 화면 목록에서 찾아 \"학생 참여\"를 누르고 번호와 이름을 입력해요.",
      "\"번호랑 이름 기억하기\"를 체크하면 같은 기기에서 다음에 자동으로 채워져요. 같은 번호로 다시 들어오면 이전 필기·진도를 이어서 볼 수 있어요.",
    ],
  },
  {
    title: "2. 교재 보기",
    items: [
      "상단 툴바에서 \"두쪽/한쪽\" 보기를 바꾸고, − / + 로 확대·축소하거나 손가락으로 꼬집어(핀치줌) 확대할 수 있어요.",
      "\"준비하기·활동하기·계획하기·실천하기·키워가기\" 캐릭터나 그 안의 번호(1,2,3…)를 누르면 그 부분만 화면에 꽉 차게 확대돼요. 사진을 누르면 사진 부분이 화면에 꽉 차게 확대돼요. 태블릿에서는 처음 누르면 확대할 영역과 가운데 돋보기 아이콘이 보이고, 아이콘을 한 번 더 누르면 확대돼요.",
      "\"확대\"(돋보기) 도구로는 원하는 네모 영역을 직접 그려서 그 부분만 확대해 볼 수 있어요.",
      "QR코드나 인터넷 주소가 적힌 부분을 누르면, 유튜브 등 영상은 팝업 안에서 바로 재생되고 그 외 링크는 새 창으로 열려요.",
      "왼쪽 목차에서 단원을 눌러 바로 이동할 수 있고, 오른쪽 위 검색창으로 교재 안의 글자를 찾아 이동할 수 있어요.",
      "\"캡처저장\" 버튼으로 지금 보이는 쪽(필기 포함)을 이미지 파일로 저장할 수 있어요.",
    ],
  },
  {
    title: "3. 필기와 메모",
    items: [
      "연필(펜)과 색펜(볼펜/사인펜/색연필/형광펜), 도형(네모/원/선/삼각형/화살표), 지우개로 교재 위에 직접 필기할 수 있어요.",
      "\"노트\" 버튼으로 메모창을 열고 \"+ 메모 추가\"로 원하는 위치에 글 메모를 붙일 수 있어요. 메모는 드래그로 옮기고 글자 크기도 조절할 수 있어요.",
      "실행취소/다시실행(↶ ↷) 버튼으로 필기와 메모 작업을 되돌릴 수 있어요.",
      "\"화이트보드\"는 교재 쪽과 별개인 빈 캔버스로, 자유롭게 쓰고 지울 수 있어요(저장되지 않음).",
      "모든 필기·메모·진도는 자동으로 저장되어, 나중에 같은 번호로 다시 들어오면 이어서 볼 수 있어요.",
    ],
  },
];

export function UsageGuideModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"teacher" | "student">("teacher");
  const sections = tab === "teacher" ? TEACHER_SECTIONS : STUDENT_SECTIONS;

  return (
    <Modal title="교재 사용 방법" onClose={onClose} widthClassName="max-w-2xl">
      <div className="mb-4 flex gap-2 border-b border-slate-200">
        {(["teacher", "student"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
              tab === t
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "teacher" ? "👩‍🏫 선생님" : "🙋 학생"}
          </button>
        ))}
      </div>
      <div className="max-h-[65vh] overflow-y-auto pr-1">
        {sections.map((s) => (
          <Section key={s.title} title={s.title} items={s.items} />
        ))}
      </div>
    </Modal>
  );
}
