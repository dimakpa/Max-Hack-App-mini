#!/bin/zsh
set -euo pipefail

RESEARCH_ROOT="${RESEARCH_ROOT:-/Users/dmitrijpavlov/dimaka/АСПИРАНТУРА/СТАТЬИ/ВАК/03_локальные_guard_verifier}"
MLX_SERVER="${MLX_SERVER:-${RESEARCH_ROOT}/.venv-v2/bin/mlx_lm.server}"
QWEN_MODEL_PATH="${QWEN_MODEL_PATH:-/Users/dmitrijpavlov/dimaka/АСПИРАНТУРА/llm-lab/hf-cache/models--mlx-community--Qwen3-8B-4bit/snapshots/545dc4251c05440727734bcd94334791f6ab0192}"
PORT="${QWEN_PORT:-11435}"

if [[ ! -x "${MLX_SERVER}" ]]; then
  print -u2 "mlx_lm.server не найден: ${MLX_SERVER}"
  exit 1
fi

if [[ ! -f "${QWEN_MODEL_PATH}/model.safetensors" ]]; then
  print -u2 "Веса Qwen не найдены: ${QWEN_MODEL_PATH}/model.safetensors"
  exit 1
fi

exec "${MLX_SERVER}" \
  --model "${QWEN_MODEL_PATH}" \
  --host 0.0.0.0 \
  --port "${PORT}" \
  --temp 0 \
  --max-tokens 500 \
  --prompt-cache-size 1 \
  --chat-template-args '{"enable_thinking":false}'
