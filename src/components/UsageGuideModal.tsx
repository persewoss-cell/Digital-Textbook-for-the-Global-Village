import { useState } from "react";
import { Modal } from "@/components/Modal";

interface Badge {
  icon: string;
  label?: string;
}

interface Item {
  text: string;
  badges?: Badge[];
}

function BadgeChip({ badge }: { badge: Badge }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
      <span>{badge.icon}</span>
      {badge.label && <span>{badge.label}</span>}
    </span>
  );
}

function Section({ title, items }: { title: string; items: Item[] }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-sm font-bold text-brand-700">{title}</h3>
      <ul className="space-y-2 text-sm text-slate-700">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1 text-slate-300">•</span>
            <span>
              {it.badges && it.badges.length > 0 && (
                <span className="mr-1.5 inline-flex flex-wrap gap-1 align-middle">
                  {it.badges.map((b, bi) => (
                    <BadgeChip key={bi} badge={b} />
                  ))}
                </span>
              )}
              {it.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TEACHER_SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "1. 반 방 만들기",
    items: [
      {
        badges: [{ icon: "+", label: "선생님: 방 만들기" }],
        text: "첫 화면 버튼에서 이름·학년·반·4자리 비밀번호를 입력해 방을 만들어요.",
      },
      {
        text: "새로 만든 방은 관리자가 승인해야 첫 화면 방 목록에 나타나고 학생이 찾아 들어올 수 있어요. 승인 전에도 선생님은 관리 화면에 들어가 학생을 미리 등록해 둘 수 있어요.",
      },
      {
        text: "방에 들어갈 때는 만들 때 정한 비밀번호를 입력해요. \"이 기기에서 비밀번호 기억하기\" 체크박스를 켜면 다음에는 바로 들어가져요.",
      },
    ],
  },
  {
    title: "2. 방 관리 화면",
    items: [
      {
        badges: [{ icon: "📖", label: "선생님용 교재 들어가기" }],
        text: "\"N학년 M반 관리\" 문구 옆의 이 초록 버튼을 누르면 선생님이 직접 그 반의 교재를 열어 자유롭게 보고 필기할 수 있어요(학생 화면을 보는 게 아니라 선생님 전용 화면이에요). 어디까지 봤는지도 선생님 계정으로 따로 저장되어, 다음에 다시 들어오면 이어서 볼 수 있어요.",
      },
      {
        text: "화면 가운데에 학생들이 지금 보고 있는 쪽과 필기가 실시간 카드로 표시돼요. 카드를 누르면 그 학생의 화면을 실시간(읽기 전용)으로 크게 볼 수 있어요.",
      },
      {
        badges: [{ icon: "👥", label: "학생 등록하기" }],
        text: "번호·이름을 하나씩 입력해 등록하거나, 엑셀 파일로 한 번에 여러 명을 등록할 수 있어요(양식 샘플 다운로드 가능). 이미 있는 번호로 다시 등록하면 이름이 수정돼요.",
      },
      {
        badges: [{ icon: "🔑", label: "비밀번호 변경하기" }],
        text: "현재 비밀번호 확인 후 새 4자리 비밀번호로 바꿀 수 있어요.",
      },
      {
        badges: [{ icon: "🗑️", label: "방 삭제하기" }],
        text: "방과 그 안의 모든 학생 필기·노트·진도가 함께 삭제되며 되돌릴 수 없어요.",
      },
    ],
  },
  {
    title: "3. 관리자 페이지 (마스터 비밀번호 필요)",
    items: [
      {
        badges: [{ icon: "🛡️", label: "모든 방" }],
        text: "모든 학급의 방을 한눈에 보고, 비밀번호를 몰라도 바로 관리 화면에 들어갈 수 있어요. 승인 대기 중인 방은 여기서 \"승인하기\" 버튼을 눌러 열어 줘요.",
      },
      {
        badges: [{ icon: "📄", label: "교재 관리" }],
        text: "학년/과목/제목을 입력해 새 교재를 등록해요. 이 프로젝트는 무료 요금제라 PDF를 화면에서 바로 올릴 수 없어서, 파일 이름을 확인한 뒤 그 PDF를 개발자(Claude)에게 채팅으로 보내면 실제로 반영돼요.",
      },
      {
        badges: [
          { icon: "🪄", label: "자동으로 후보 찾기" },
        ],
        text: "등록된 교재의 \"목차 관리\"에서 이 버튼으로 PDF 속 실제 차례를 자동 추출하거나, 직접 단원 제목·시작 쪽을 입력/수정할 수 있어요.",
      },
    ],
  },
  {
    title: "4. 학년별 교재 체험하기",
    items: [
      {
        badges: [{ icon: "📖", label: "학년별 교재 체험하기" }],
        text: "실제 방을 만들지 않고도 3~6학년 교재를 학생 화면과 똑같이 미리 둘러볼 수 있어요.",
      },
      { text: "여기서 한 필기·메모·확대 등은 저장되지 않고, 나가면 사라져요(연습/시연용)." },
    ],
  },
];

const STUDENT_SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "1. 방 참여하기",
    items: [
      {
        badges: [{ icon: "👦", label: "학생" }],
        text: "선생님이 알려준 방을 첫 화면 목록에서 찾아 이 버튼을 누르고 번호와 이름을 입력해요.",
      },
      {
        text: "\"번호랑 이름 기억하기\" 체크박스를 켜면 같은 기기에서 다음에 자동으로 채워져요. 같은 번호로 다시 들어오면 이전 필기·진도를 이어서 볼 수 있어요.",
      },
    ],
  },
  {
    title: "2. 교재 보기",
    items: [
      {
        badges: [{ icon: "📚", label: "목차" }],
        text: "누르면 왼쪽 목차 패널이 열리고 다시 누르면 닫혀요(켜져 있으면 아이콘 오른쪽 위에 빨간 점이 떠요). 패널 안에서 단원을 누르면 그 쪽으로 바로 이동해요.",
      },
      {
        badges: [{ icon: "두쪽" }, { icon: "한쪽" }],
        text: "상단 툴바에서 두 쪽씩/한 쪽 크게 보기를 바꿀 수 있어요. (전체화면 모드에서는 이 버튼이 없고 항상 두 쪽 보기예요 - 아래 \"3. 전체화면으로 몰입해서 보기\" 참고.)",
      },
      {
        badges: [{ icon: "－" }, { icon: "＋" }],
        text: "쪽 전체를 확대·축소해요. 태블릿/휴대폰에서는 손가락으로 꼬집어(핀치줌) 확대할 수도 있고, 마우스 휠(트랙패드 두 손가락 오므리기 포함)로도 확대·축소돼요. 100%가 아닐 때는 \"↺100%\" 버튼이 나타나 한 번에 원래 크기로 되돌릴 수 있어요.",
      },
      {
        text: "\"준비하기·활동하기·계획하기·실천하기·키워가기\" 캐릭터나 그 안의 번호(1,2,3…)를 누르면 그 부분만 화면에 꽉 차게 확대돼요. 사진을 누르면 사진 부분이 화면에 꽉 차게 확대돼요. 태블릿에서는 처음 누르면 확대할 영역과 가운데 🔍 아이콘이 보이고, 아이콘을 한 번 더 누르면 확대돼요.",
      },
      {
        badges: [{ icon: "🔍", label: "확대" }],
        text: "이 돋보기 도구로는 원하는 네모 영역을 직접 그려서 그 부분만 확대해 볼 수 있어요.",
      },
      {
        text: "QR코드나 인터넷 주소가 적힌 부분을 누르면, 유튜브 등 영상은 팝업 안에서 바로 재생되고 그 외 링크는 새 창으로 열려요.",
      },
      {
        badges: [{ icon: "🔎" }],
        text: "오른쪽 위 검색창에 글자를 입력하고 이 버튼을 누르면 교재 안에서 찾아 이동할 수 있어요.",
      },
      {
        badges: [{ icon: "📷", label: "캡처저장" }],
        text: "지금 보이는 쪽(필기 포함)을 이미지 파일로 저장해요.",
      },
      {
        badges: [{ icon: "📝", label: "노트" }],
        text: "오른쪽 노트창을 열고 닫아요(켜져 있으면 빨간 점이 떠요). 자세한 내용은 아래 \"필기와 메모\"를 참고하세요.",
      },
    ],
  },
  {
    title: "3. 전체화면으로 몰입해서 보기",
    items: [
      {
        badges: [{ icon: "⛶", label: "전체화면" }],
        text: "화이트보드 버튼 옆의 이 아이콘을 누르면 브라우저 전체화면(컴퓨터의 F11 키와 같아요)으로 바뀌면서 교재가 화면 전체를 차지해요. 특히 태블릿·휴대폰을 가로로 눕혀서 볼 때 화면을 최대한 넓게 쓸 수 있어요.",
      },
      {
        text: "전체화면일 때는 상단 툴바가 로고 옆에 한 줄로 작게 줄어들어요. 이 줄에는 두 쪽/한 쪽 전환, 목차, 검색, 캡처저장, 노트 버튼은 빠지고(교재를 보는 데만 집중하도록) 확대·축소, 돋보기, 연필·색펜·도형·지우개, 실행취소·다시실행, 화이트보드, 축소 버튼만 남아요. 보기 방식은 항상 두 쪽 보기로 고정돼요.",
      },
      {
        badges: [{ icon: "⛶", label: "축소" }],
        text: "전체화면 상태에서는 같은 자리의 버튼이 \"축소\"로 바뀌어요. 이걸 누르거나 컴퓨터에서는 Esc 키를 누르면 원래 화면(목차·검색·노트가 있는 레이아웃)으로 돌아와요.",
      },
    ],
  },
  {
    title: "4. 필기와 메모",
    items: [
      {
        badges: [{ icon: "✏️", label: "연필" }],
        text: "교재 위에 검은색 펜으로 자유롭게 필기해요. 누르면 바로 켜지고(빨간 점 표시), 다시 누르면 바로 꺼져요.",
      },
      {
        badges: [{ icon: "🖊️", label: "색펜" }],
        text: "누르면 펜 종류(볼펜/사인펜/색연필/형광펜)와 색상을 고르는 창이 떠요. 종류와 색을 고르면 그 펜이 바로 켜져요(빨간 점 표시). 켜진 상태에서 아이콘을 다시 누르면 창이 또 뜨지 않고 바로 꺼지고, 꺼진 상태에서 누르면 다시 고르는 창이 떠요.",
      },
      {
        badges: [{ icon: "🔷", label: "도형" }],
        text: "네모/원/선/삼각형/화살표 도형을 색상과 함께 고를 수 있는 창이 떠요. 색펜과 똑같이, 켜진 상태에서 아이콘을 다시 누르면 바로 꺼지고 꺼진 상태에서 누르면 고르는 창이 다시 떠요.",
      },
      {
        badges: [{ icon: "🧹", label: "지우개" }],
        text: "누르면 지우개 굵기를 고르는 창이 3×3(9단계) 원 모양으로 떠요 - 오른쪽 아래로 갈수록 굵어지며, 가장 작은 건 교재의 가장 작은 글씨 정도, 가장 큰 건 쪽 너비의 4분의 1 정도예요. 굵기를 고르면 그 크기의 지우개가 바로 켜지고, 화면에 실제 지워질 크기의 동그란 커서가 손가락/마우스를 따라다녀요. 색펜·도형과 똑같이 켜진 상태에서 다시 누르면 바로 꺼져요. 지우개로 메모 위를 지나가면 그 메모도 함께 지워져요.",
      },
      {
        text: "펜/색펜/도형/지우개/화이트보드가 켜진 상태에서 교재(또는 화이트보드) 위에서 마우스 오른쪽 버튼을 누르면 그 자리에서 바로 선택이 해제돼요.",
      },
      {
        badges: [{ icon: "↶" }, { icon: "↷" }],
        text: "실행취소/다시실행 버튼으로 필기와 메모 작업을 되돌릴 수 있어요. 다시실행은 되돌린 순서 그대로, 되돌릴 게 없어질 때까지 여러 번 눌러도 계속 이어져요.",
      },
      {
        badges: [{ icon: "📝", label: "노트" }],
        text: "메모창을 열고 안의 \"+ 메모 추가\" 버튼을 누른 뒤 교재의 빈 곳을 누르면 그 자리에 글 메모가 생겨요. 메모는 드래그로 옮기고(두 쪽 보기에서 가운데 경계를 넘어 옆 쪽으로도 옮길 수 있어요) 글자 크기도 조절할 수 있어요. 메모 글이 길어서 자기 쪽 경계를 넘어가도 잘리지 않고 옆 쪽 위까지 계속 보여요.",
      },
      {
        badges: [{ icon: "🖍️", label: "화이트보드" }],
        text: "교재 쪽과 별개인 빈 캔버스로, 자유롭게 쓰고 지울 수 있어요(저장되지 않음). 켜져 있을 때만 옆에 \"🗑️ 모두 지우기\" 버튼이 나타나 화이트보드 내용을 한 번에 지울 수 있어요.",
      },
      { text: "모든 필기·메모·진도는 자동으로 저장되어, 나중에 같은 번호로 다시 들어오면 이어서 볼 수 있어요." },
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
