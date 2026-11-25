#!/usr/bin/env bash
# Codegeist 2026 — AgentLedger demo recorder (deadline 22 Dec 2026, 12:00 PM PT)
#
# Usage:
#   ./record_demo.sh                 # record the browser window for the script
#   ./record_demo.sh --cue           # only print the timed cue sheet (no recording)
#   ./record_demo.sh --seconds 240   # explicit capture length
#   ./record_demo.sh --out FILE.mp4  # custom output path
#   ./record_demo.sh --window 0x2c00004   # capture a specific X11 window
#   ./record_demo.sh --title-only "Text" # render one title card and exit
#
# What it records: the Brave window only (captured by X11 window id), so
# whatever else is on the desktop never leaks into the video and the browser
# chrome stays full-screen. A compositor is running (MATE), so the window's own
# pixmap is captured and overlapping windows are not baked in.
#
# The demo itself is a Jira session: the AgentLedger issue panel, the Rovo
# agent and one MCP tool call. The cue sheet below is the shot list from
# submission/SUBMISSION.md; hit each beat at or after its timestamp so the
# final video stays under the 5-minute hard limit.

set -uo pipefail

DURATION_SEC=240
OUT="/home/c0bw3b/Proj/codegeist2026/agentledger-forge/submission/agentledger_demo_$(date +%Y%m%d_%H%M).mp4"
WINDOW_ID=""
CUE_ONLY=0
TITLE_ONLY=""
TITLE_SEC=6

while [[ $# -gt 0 ]]; do
  case "$1" in
    --seconds)    DURATION_SEC="$2"; shift 2 ;;
    --out)        OUT="$2"; shift 2 ;;
    --window)     WINDOW_ID="$2"; shift 2 ;;
    --title-only) TITLE_ONLY="$2"; shift 2 ;;
    --title-secs) TITLE_SEC="$2"; shift 2 ;;
    --cue)        CUE_ONLY=1; shift ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done

print_cues() {
  cat <<'CUE'
────────────────────────────────────────────────────────────────────────
 AgentLedger demo — cue sheet (target 3:30, hard limit 5:00)
────────────────────────────────────────────────────────────────────────
 0:00  Title card: "An agent acted on my issue. Who was it, was it allowed,
       and can I prove it?"  -> AgentLedger
 0:20  Jira issue KAN-1 (Bugbounty Test). Issue header -> "View app actions"
       -> AgentLedger. The panel opens; "Agent identity" card appears.
 0:35  The reference JyP9X278CKWoNLAFg5kVr is prefilled. Press Verify.
 0:55  Registry checks tick in: on-chain agent found, status active, agent URI
       present, card fetched, card hash matches, badge present, owner matches,
       extension conformant. BotIn #1190 is Concordium #1190.
 1:25  Scroll the panel to the "Action policy" table: refund / close / approve
       are "human approval required"; comment / triage / transition are not.
 1:50  Record -> "Comment on an issue"  => verdict ALLOWED, trail gains an entry.
 2:05  Record -> "Trigger a refund / payout" => verdict FLAGGED (human-gated).
 2:25  Rovo: open the "AgentLedger Auditor" agent in Jira, ask
       "Show the attestation trail for this issue" -> answers from the trail.
 2:50  MCP: "Work item context" for KAN-1 -> work item, goals, comments.
 3:10  Back to the panel: chain intact, head hash shown, summary counts.
 3:25  Title card: "AgentLedger — verifiable identity, human-gated authority,
       and a trail you can check. Built on Forge."
────────────────────────────────────────────────────────────────────────
CUE
}

# ── title card ────────────────────────────────────────────────────────────────
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
render_title() {
  local text="$1" file="$2" secs="$3"
  ffmpeg -y -f lavfi -i "color=c=0x0b1220:s=1366x768:r=30:d=${secs}" \
    -vf "drawtext=fontfile=${FONT}:text='${text}':fontcolor=white:fontsize=54:x=(w-text_w)/2:y=(h-text_h)/2-40,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='AgentLedger':fontcolor=0x7cc4ff:fontsize=34:x=(w-text_w)/2:y=(h-text_h)/2+60" \
    -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$file" 2>/dev/null
}

if [[ -n "$TITLE_ONLY" ]]; then
  out="/tmp/opencode/title_$(date +%s).mp4"
  render_title "$TITLE_ONLY" "$out" "$TITLE_SEC"
  echo "$out"
  exit 0
fi

if [[ "$CUE_ONLY" == "1" ]]; then
  print_cues
  exit 0
fi

command -v ffmpeg >/dev/null || { echo "ERROR: ffmpeg not installed"; exit 1; }
export DISPLAY="${DISPLAY:-:0}"
FPS=30

if [[ -z "$WINDOW_ID" ]]; then
  WINDOW_ID="$(xwininfo -root -tree 2>/dev/null \
    | awk '/"brave-browser"/ { gsub(/.*0x/,"0x",$1); print $1; exit }')"
fi
[[ -n "$WINDOW_ID" ]] || { echo "ERROR: could not find the Brave window id"; exit 1; }

GEOMETRY="$(xwininfo -id "$WINDOW_ID" 2>/dev/null | awk '/Width:/ {w=$2} /Height:/ {h=$2} END {print w"x"h}')"
GEOMETRY="${GEOMETRY:-1366x677}"

echo "==> window: $WINDOW_ID  geometry: $GEOMETRY @ ${FPS}fps"
echo "==> target length: ${DURATION_SEC}s -> $OUT"
print_cues
echo "==> recording in 5 seconds..."
sleep 5

RAW="/tmp/opencode/raw_demo_$$.mp4"
ffmpeg -y -f x11grab -framerate "$FPS" -video_size "$GEOMETRY" -i "$WINDOW_ID" \
       -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p \
       -t "$DURATION_SEC" "$RAW" 2>/tmp/opencode/ffmpeg_raw.log &
FFPID=$!

cleanup() {
  kill "$FFPID" 2>/dev/null
}
trap cleanup INT TERM

sleep "$DURATION_SEC"
kill "$FFPID" 2>/dev/null
wait "$FFPID" 2>/dev/null

if [[ ! -s "$RAW" ]]; then
  echo "ERROR: no frames captured — see /tmp/opencode/ffmpeg_raw.log"
  tail -20 /tmp/opencode/ffmpeg_raw.log
  exit 1
fi

echo "==> raw capture: $(ls -lh "$RAW" | awk '{print $5}')"

# ── title cards ───────────────────────────────────────────────────────────────
INTRO="/tmp/opencode/title_intro_$$.mp4"
OUTRO="/tmp/opencode/title_outro_$$.mp4"
render_title "An agent acted on my issue." "$INTRO" 5
render_title "Verifiable identity. Human-gated authority. A trail you can check." "$OUTRO" 6

ffmpeg -y -i "$INTRO" -i "$RAW" -i "$OUTRO" \
  -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0[v12];[v12][2:v]concat=n=2:v=1:a=0[v]" \
  -map "[v]" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$OUT" 2>/tmp/opencode/ffmpeg_concat.log

rm -f "$RAW" "$INTRO" "$OUTRO"

echo "==> done: $OUT"
ls -lh "$OUT" 2>/dev/null
echo "==> sanity: duration / streams"
ffprobe -v error -show_entries format=duration,size \
        -show_entries stream=codec_name,width,height \
        -of default=noprint_wrappers=1 "$OUT" 2>/dev/null

cat <<'NEXT'
────────────────────────────────────────────────────────────────────────
 Next:
   1. ffprobe the file above — it must be < 300 s (5 min hard limit).
   2. Upload to YouTube as PUBLIC (not unlisted), on the Lakterian channel
      of lakterian9@gmail.com:
         https://studio.youtube.com  ->  Create -> Upload videos
      Title: AgentLedger — verifiable identity and a tamper-evident trail
        for AI agents in Atlassian
      Description: see submission/SUBMISSION.md ("Description for YouTube").
      Visibility: Public.
   3. Copy the public URL into submission/SUBMISSION.md and the Devpost form.
────────────────────────────────────────────────────────────────────────
NEXT
