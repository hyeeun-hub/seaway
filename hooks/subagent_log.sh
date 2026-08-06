#!/usr/bin/env bash
# subagent_log.sh - ERP Flow Harness 실행 로그 기록 예시
# 심사 기준의 반복 실행 안정성/재현성을 돕기 위한 훅 보조 스크립트 예시다.
# 실제 실행 경로, 로그 위치, 에이전트/스킬 이름은 운영 환경에 맞춰 조정한다.

LOG_DIR="${LOG_DIR:-./logs}"
mkdir -p "$LOG_DIR"

log() {
  local ts
  ts=$(date +"%Y-%m-%d %H:%M:%S")
  echo "[$ts] $*" | tee -a "$LOG_DIR/erp-flow.log"
}

log "ERP Flow Harness 실행 로그 시작"
log "hook_settings=hooks/settings.json"
log "workflow=workflow.md"
log "agents=agents/"
log "skills=skills/"
log "data=data/"
log "종료: ERP Flow Harness 실행 로그 기록 완료"
