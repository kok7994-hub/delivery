# Vercel 배포용 정리본

이 ZIP은 Replit에서 생성된 프로젝트를 Vercel에 올리기 쉽게 정리한 버전입니다.

## 변경한 내용

- `.git`, `.local`, Replit 전용 폴더 제거
- Vite 설정에서 `PORT`, `BASE_PATH` 필수 오류 제거
- Vercel용 `vercel.json` 추가
- Express API를 Vercel Serverless Function으로 연결하기 위해 `api/[...path].ts` 추가
- 프론트 빌드 결과 경로를 `artifacts/delivery-app/dist/public`로 지정

## GitHub 업로드 방법

1. 이 ZIP 압축 해제
2. 압축 해제한 폴더 안의 파일/폴더 전체 업로드
3. GitHub 루트에 아래 항목들이 보여야 정상입니다.

```txt
artifacts/
lib/
api/
package.json
pnpm-workspace.yaml
vercel.json
```

## Vercel 설정

Vercel에서 새 프로젝트로 Import할 때는 Root Directory를 비워두세요.

- Framework Preset: Vite 또는 Other
- Root Directory: 비워두기
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm --filter @workspace/delivery-app build`
- Output Directory: `artifacts/delivery-app/dist/public`

`vercel.json`에 이미 들어있어서 보통은 자동 적용됩니다.

## 주의

이 앱은 DB를 사용합니다. Vercel 배포 후 정상 동작하려면 Environment Variables에 아래 값을 넣어야 합니다.

```txt
DATABASE_URL=PostgreSQL 연결 주소
OPENAI_API_KEY=OpenAI API 키  # 이미지에서 주소 추출 기능을 쓸 때만 필요
```

DB가 없으면 화면 빌드는 되더라도 세션 생성/목록 조회 같은 기능은 실패할 수 있습니다.
