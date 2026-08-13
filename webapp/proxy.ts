import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 심사·시연용 공유 비밀번호 관문.
//
// 이건 사용자별 계정 인증이 아니다 — 비밀번호 하나를 아는 사람 전부가 같은 권한으로
// 들어온다. 링크를 받은 심사위원만 열람하게 하려는 목적이고, 실제 운영에 쓰려면
// 사용자별 인증으로 교체해야 한다.
//
// Vercel Password Protection은 무료(Hobby) 플랜에서 쓸 수 없고 Pro에서도 별도 유료
// 애드온이라, 앱 레벨에서 직접 막는다.
//
// SITE_PASSWORD가 비어 있으면 관문을 열어둔다 — 로컬 개발에서 매번 비밀번호를 묻지
// 않기 위해서다. 배포 환경(Vercel)에만 환경변수를 설정한다.
export function proxy(request: NextRequest) {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) {
    return NextResponse.next();
  }

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    // "Basic base64(id:pw)" — 아이디는 무엇이든 상관없고 비밀번호만 확인한다.
    // 첫 번째 콜론까지가 아이디이므로, 비밀번호에 콜론이 있어도 잘리지 않는다.
    let decoded = "";
    try {
      decoded = atob(header.slice("Basic ".length));
    } catch {
      decoded = "";
    }
    const separator = decoded.indexOf(":");
    const provided = separator === -1 ? "" : decoded.slice(separator + 1);
    if (equalsInConstantTime(provided, expected)) {
      return NextResponse.next();
    }
  }

  return new NextResponse("이 페이지를 보려면 비밀번호가 필요합니다.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="ERP Flow", charset="UTF-8"',
      // 검색엔진에 노출되지 않게 한다(401이면 크롤러가 못 들어오지만 명시해 둔다).
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

// 앞자리부터 순서대로 비교하면 응답 시간 차이로 비밀번호를 한 글자씩 알아낼 수 있다.
// 길이가 같으면 항상 끝까지 비교한다(길이 자체는 드러나지만 그 정도는 감수한다).
function equalsInConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// 정적 자산만 제외하고 나머지 전부를 막는다. **API 경로를 빼면 안 된다** —
// 화면은 막히는데 /api/review, /api/upload 같은 변경 API가 열려 있으면
// 비밀번호를 모르는 사람도 검수 결정을 바꾸거나 파일을 올릴 수 있다.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
