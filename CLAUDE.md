# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 먼저 읽을 것

**[AGENTS.md](AGENTS.md)** — 아키텍처, 도메인 사실, 프로젝트 규칙, 명령어.
이 파일은 Claude Code에만 해당하는 내용만 담습니다.

## 이 레포는 계획 주도로 진행됩니다

코드를 쓰기 전에 해당 태스크를 읽으세요. 계획에는 테스트·구현 코드와 결정의 근거가 이미 들어 있습니다.

- 스펙: `docs/superpowers/specs/2026-08-13-seoul-events-webapp-design.md`
- 계획: `docs/superpowers/plans/2026-08-13-batch-pipeline.md`

계획을 실행할 때는 `superpowers:subagent-driven-development`(태스크마다 새 서브에이전트)
또는 `superpowers:executing-plans`(인라인 배치 실행)를 씁니다.

계획에 없는 새 기능을 요청받으면 코드부터 쓰지 말고 `superpowers:brainstorming`으로 시작하세요.
이 레포의 스펙과 계획이 그 과정에서 나온 산출물입니다.

## 계획을 벗어날 때

실측이 계획의 전제를 뒤집는 일이 실제로 일어납니다
(예: 비짓서울 상세 API에 좌표가 있다는 사실 때문에 "보강재"였던 소스가 대칭 소스가 됐습니다).

전제가 틀렸으면 계획을 조용히 우회하지 말고 **스펙과 계획을 고친 뒤 진행**하세요.
두 문서 모두 커밋돼 있으므로 변경이 이력에 남습니다.

## 미해결 항목

스펙 14장에 구현 전 확인해야 할 항목들이 있습니다(API 키 발급, 이미지 필드 존재 여부,
`/contents/standard/list` 벌크 조회 가능성, 카테고리 수집 범위, 데이터 크기).
Task 0의 스파이크가 이것들을 해소하고 `docs/api-findings.md`에 기록합니다.
그 파일이 생기기 전에는 API 필드에 대한 가정을 코드에 넣지 마세요.
