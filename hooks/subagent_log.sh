#!/usr/bin/env bash
# subagent_log.sh - Claude Code 훅이 실제로 호출하는 로그 스크립트.
# .claude/settings.json의 SessionStart/SubagentStop 훅이 이 스크립트를 실행하며,
# 훅 이벤트 JSON을 stdin으로 넘겨준다. 고정 문자열을 찍지 않고, 실제 이벤트 필드를 기록한다.
# 참고: SPEC.md §6 (verify-agent가 도는 6개 지점), state-schema.md (거래/파일 처리 스키마)

set -euo pipefail

LOG_DIR="${LOG_DIR:-${CLAUDE_PROJECT_DIR:-.}/logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/erp-flow.log"

input="$(cat)"

get() {
  # jq가 없는 환경도 있을 수 있으니 있으면 쓰고, 없으면 grep으로 얕게 뽑는다.
  if command -v jq >/dev/null 2>&1; then
    echo "$input" | jq -r --arg k "$1" '.[$k] // "-"'
  else
    echo "$input" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E 's/.*:[[:space:]]*"(.*)"/\1/'
  fi
}

ts="$(date +"%Y-%m-%d %H:%M:%S")"
event="$(get hook_event_name)"
session_id="$(get session_id)"
agent_type="$(get agent_type)"
agent_id="$(get agent_id)"

{
  case "$event" in
    SubagentStop)
      echo "[$ts] event=SubagentStop session=$session_id agent_type=$agent_type agent_id=$agent_id"
      ;;
    SessionStart)
      session_type="$(get session_type)"
      echo "[$ts] event=SessionStart session=$session_id session_type=$session_type"
      ;;
    *)
      echo "[$ts] event=${event:-unknown} session=$session_id raw=$input"
      ;;
  esac
} >> "$LOG_FILE"
