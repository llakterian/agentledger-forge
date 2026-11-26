#!/usr/bin/env bash
# Codegeist 2026: assemble the final demo video from the recorded takes.
#
# Usage:
#   ./assemble_demo.sh [OUTPUT.mp4]
#
# The pieces, in order:
#   1. an opening title card (rendered here, no browser involved)
#   2. submission/take_*.mp4: the Jira take: panel, verify, policy, records
#   3. the Rovo agent take: the AgentLedger Auditor session card on the issue
#   4. a closing title card
#
# Everything is trimmed with -ss/-t so the final file stays under the 5-minute
# hard limit (YouTube/Devpost reject anything longer).

set -euo pipefail

SUBMISSION="$(cd "$(dirname "$0")" && pwd)"
FILES="/tmp/opencode-browser-files-22922-evciS0"
OUT="${1:-${SUBMISSION}/agentledger_demo.mp4}"

INTRO_TEXT="An agent acted on my issue."
INTRO_SUB="Who was it, and was it allowed?"
OUTRO_TEXT="Verifiable identity. Human-gated authority."
OUTRO_SUB="A trail you can check."
W=1280
H=536
FPS=30

BOLD=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
REG=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf

title_card() {
  # $1 = headline (kept short enough to fit on one line), $2 = output
  # $3 = optional sub-line rendered under the headline
  local text="$1" out="$2" sub="${3:-}"
  local subfilter=""
  if [[ -n "$sub" ]]; then
    subfilter=",drawtext=fontfile=${BOLD}:text='${sub//\'/\\\'}':fontcolor=white:fontsize=30:x=(w-text_w)/2:y=(h-text_h)/2+8"
  fi
  ffmpeg -y -loglevel error -f lavfi -i "color=c=0x0b1220:s=${W}x${H}:r=${FPS}:d=6" \
    -vf "drawtext=fontfile=${BOLD}:text='${text}':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=(h-text_h)/2-26${subfilter},drawtext=fontfile=${REG}:text='AgentLedger':fontcolor=0x7cc4ff:fontsize=28:x=(w-text_w)/2:y=(h-text_h)/2+50" \
    -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$out"
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> rendering title cards"
title_card "$INTRO_TEXT" "$WORK/intro.mp4" "$INTRO_SUB"
title_card "$OUTRO_TEXT" "$WORK/outro.mp4" "$OUTRO_SUB"

# Take 1: the panel. 0:00 -> 3:45 covers empty panel, verify, policy table,
# the two records and the trail.
echo "==> trimming the panel take"
ffmpeg -y -loglevel error -ss 0 -t 225 \
  -i "$FILES/codegeist_demo_take3.mp4" \
  -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$WORK/panel.mp4"

# Take 2: the Rovo agent session card. The view is steady from 0:08 onwards.
echo "==> trimming the agent take"
ffmpeg -y -loglevel error -ss 8 -t 14 \
  -i "$FILES/codegeist_demo_verdict.mp4" \
  -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$WORK/agent.mp4"

echo "==> concatenating"
cat > "$WORK/list.txt" <<EOF
file '$WORK/intro.mp4'
file '$WORK/panel.mp4'
file '$WORK/agent.mp4'
file '$WORK/outro.mp4'
EOF
# The concat demuxer stitches the four pieces; the re-encode fixes the
# timestamps so the result plays as one continuous video.
ffmpeg -y -loglevel error -f concat -safe 0 -i "$WORK/list.txt" \
  -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -r $FPS "$OUT"

echo "==> done: $OUT"
ls -lh "$OUT"
ffprobe -v error -show_entries format=duration,size \
        -show_entries stream=codec_name,width,height,avg_frame_rate \
        -of default=noprint_wrappers=1 "$OUT"

DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" | cut -d. -f1)"
if [[ "$DUR" -ge 300 ]]; then
  echo "ERROR: ${DUR}s exceeds the 300s hard limit, trim the takes further"
  exit 1
fi
echo "==> ${DUR}s (hard limit 300s)"